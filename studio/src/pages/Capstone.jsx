/**
 * Capstone page (CAP-02..05) — route `#/course/:id/capstone`.
 *
 * Shows the artifact ("Your artifact"), the immutable brief and rubric, the tutor in CAPSTONE mode
 * (concept discussion only), and the submission form. Submitting runs the capstone's self-check
 * tests through the Phase 29 runner (programming) and a rubric review through `generateJson`, then
 * stores an immutable submission row. A Course Complete verdict shows the completion panel and the
 * COMPLETION.md export.
 *
 * Two evidence modes (D-03): a template capstone (`capstoneEvidenceMode` → `'external'`) never runs
 * anything here. The learner pastes their own Playwright report, the parsed evidence is the only
 * source of run facts, and the verdict comes from `computeCapstoneVerdict` — never from the model.
 * The in-app branch (a generated capstone with `tests`) is unchanged.
 */
import { useEffect, useState } from 'react';
import { Link } from '../lib/router.js';
import {
  getCourse,
  getCapstone,
  createCapstoneSubmission,
  listCapstoneSubmissions,
  listCourseWorkspaceFiles,
  updateCourse,
  logActivity,
  onChange,
} from '../lib/repo/index.js';
import { useSettings } from '../lib/settings.js';
import { useT } from '../lib/i18n/index.js';
import { getProvider, createGenerateJson } from '../lib/ai/index.js';
import { useStream } from '../lib/ai/useStream.js';
import {
  buildCapstoneReviewMessages,
  capstoneReviewValidator,
  validateCapstoneReview,
  clampReviewVerdict,
  buildExternalCapstoneReviewMessages,
  validateExternalCapstoneReview,
} from '../lib/prompts/capstone.js';
import {
  capstoneUnlocked,
  capstoneProgress,
  capstoneHasTests,
  capstoneEvidenceMode,
  runCapstoneTests,
  generateCapstoneForCourse,
  toCompletionMarkdown,
  completionFilename,
  artifactLabel,
  computeCapstoneFacts,
  finalizeExternalReview,
  computeCapstoneVerdict,
} from '../lib/capstone.js';
import { slugify } from '../lib/course.js';
import { download } from '../lib/course-export.js';
import { Markdown } from '../components/ui/Markdown.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Progress } from '../components/ui/Progress.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ErrorNotice } from '../components/ui/ErrorNotice.jsx';
import { ArtifactCard } from '../components/capstone/ArtifactCard.jsx';
import { RubricList } from '../components/capstone/RubricList.jsx';
import { SubmissionForm } from '../components/capstone/SubmissionForm.jsx';
import { SubmissionHistory } from '../components/capstone/SubmissionHistory.jsx';
import { ReviewPanel } from '../components/capstone/ReviewPanel.jsx';
import { ExternalEvidenceForm } from '../components/capstone/ExternalEvidenceForm.jsx';
import { CompletionPanel } from '../components/capstone/CompletionPanel.jsx';
import { TutorPanel } from '../components/tutor/TutorPanel.jsx';

export function Capstone({ id }) {
  const t = useT();
  const [settings] = useSettings();
  const [course, setCourse] = useState(null);
  const [capstone, setCapstone] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [runnerError, setRunnerError] = useState(null);
  const [evidenceResult, setEvidenceResult] = useState({ text: '', evidence: null, confirmed: false });
  const [revisionTarget, setRevisionTarget] = useState(null);
  const [draft, setDraft] = useState('');
  const [spec, setSpec] = useState({ path: '', code: '' });
  const gen = useStream();

  const refresh = async () => {
    const nextCourse = await getCourse(id);
    setCourse(nextCourse);
    const nextCapstone = nextCourse ? await getCapstone(id) : null;
    setCapstone(nextCapstone);
    setSubmissions(nextCapstone ? await listCapstoneSubmissions(nextCapstone.id) : []);
    return { course: nextCourse, capstone: nextCapstone };
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refresh();
        const files = await listCourseWorkspaceFiles(id).catch(() => []);
        if (alive) setWorkspaceFiles(files);
      } catch {
        /* handled by the not-found state below */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    const off = onChange((detail) => {
      if (['courses', 'lessons', 'capstones', 'capstone_submissions', '*'].includes(detail.table)) {
        refresh().catch(() => {});
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, [id]);

  if (!loaded) return <p className="text-sm text-neutral-500">{t('common.loading')}</p>;
  if (!course) {
    return (
      <EmptyState
        title={t('capstone.notFound.title')}
        description={t('capstone.notFound.description')}
        action={
          <Link to="/">
            <Button variant="secondary">{t('capstone.notFound.back')}</Button>
          </Link>
        }
      />
    );
  }

  const unlocked = capstoneUnlocked(course);
  const progress = capstoneProgress(course);
  const evidenceMode = capstoneEvidenceMode(capstone);
  const external = evidenceMode === 'external';
  // One spec-code source (A3): this exact object feeds the evidence form's warnings and
  // `computeCapstoneFacts`, so the two can never disagree about the learner's files.
  const submittedFiles = spec.path.trim() && spec.code.trim() ? { [spec.path.trim()]: spec.code } : null;
  const latest = submissions[submissions.length - 1] || null;
  const completionSubmission = [...submissions].reverse().find((s) => s.verdict === 'course_complete') || null;
  const completed = Boolean(completionSubmission);
  const tutorLesson = { id: `capstone:${capstone?.id || course.id}`, title: artifactLabel(capstone?.artifact) || t('capstone.capstoneTutorTitle') };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await generateCapstoneForCourse({ course, artifact: course.artifact, settings });
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setGenerating(false);
    }
  };

  const submit = async (input) => {
    setSubmitting(true);
    setError(null);
    setRunnerError(null);

    // Captured before the insert (pitfall 10): the link must point at a row that already existed.
    const revisionOf =
      revisionTarget && submissions.some((submission) => submission.id === revisionTarget)
        ? { feedbackTable: 'capstone_submissions', feedbackId: revisionTarget }
        : null;

    let testResults = null;
    let review = null;
    let verdict = null;
    let submissionFiles = input.files ?? null;

    if (external) {
      if (!(evidenceResult.confirmed && evidenceResult.evidence)) {
        setError(
          Object.assign(new Error(t('externalEvidence.submitRequiresEvidence')), {
            hint: t('externalEvidence.confirmHint'),
          })
        );
        setSubmitting(false);
        return;
      }

      const files = input.files ?? submittedFiles;
      submissionFiles = files;
      const facts = computeCapstoneFacts({ files, contentMd: input.content_md });
      const evidence = { ...evidenceResult.evidence, facts };
      testResults = evidence;

      try {
        const provider = await getProvider(settings);
        const generateJson = createGenerateJson(provider.streamText.bind(provider));
        const { system, messages } = buildExternalCapstoneReviewMessages({
          capstone,
          submission: input,
          evidence,
          facts,
          course,
        });
        const raw = await gen.start(({ signal }) =>
          generateJson({
            system,
            messages,
            signal,
            validate: (obj) => {
              const validated = validateExternalCapstoneReview(obj, {
                capstone,
                language: course?.language,
              });
              return validated.ok ? true : validated.error;
            },
            language: course?.language,
          })
        );
        const finalized = finalizeExternalReview(raw, {
          capstone,
          evidence,
          facts,
          language: course?.language,
        });
        const computed = computeCapstoneVerdict({ review: finalized, evidence, facts });
        review = { ...finalized, verdict: computed.verdict };
        verdict = computed.verdict;
      } catch (err) {
        // A failed review never loses the paste: store the evidence with a computed needs_work.
        setError(err);
        verdict = 'needs_work';
      }
    } else {
      let testsFailed = false;
      if (capstoneHasTests(capstone)) {
        if (input.files) {
          try {
            testResults = await runCapstoneTests({
              capstone,
              files: input.files,
              courseSlug: slugify(course.title),
            });
            testsFailed = Boolean(testResults?.failed);
          } catch (err) {
            setRunnerError(err);
          }
        } else {
          setRunnerError(
            Object.assign(new Error(t('capstone.noWorkspaceFiles')), {
              hint: t('capstone.noWorkspaceFilesHint'),
            })
          );
        }
      }

      try {
        const provider = await getProvider(settings);
        const generateJson = createGenerateJson(provider.streamText.bind(provider));
        const { system, messages } = buildCapstoneReviewMessages({ capstone, submission: input, testResults, course });
        const raw = await gen.start(({ signal }) =>
          generateJson({
            system,
            messages,
            signal,
            validate: capstoneReviewValidator({ testsFailed, rubric: capstone.rubric }),
            language: course?.language,
          })
        );
        const validated = validateCapstoneReview(raw, { testsFailed, rubric: capstone.rubric });
        if (!validated.ok) throw new Error(validated.error);
        review = clampReviewVerdict(validated.value, { testsFailed });
      } catch (err) {
        setError(err);
      }
      verdict = review?.verdict || null;
    }

    await createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: input.content_md,
      repo_url: input.repo_url,
      files: submissionFiles,
      testResults,
      review,
      verdict,
      revisionOf,
    });

    if (verdict === 'course_complete') {
      await updateCourse(course.id, { status: 'completed' });
      await logActivity('capstone_complete', course.id);
    }

    if (external) {
      setEvidenceResult({ text: '', evidence: null, confirmed: false });
      setRevisionTarget(null);
    }

    await refresh();
    setSubmitting(false);
  };

  const exportCompletion = () => {
    if (!completionSubmission) return;
    download(completionFilename(course), toCompletionMarkdown({ course, capstone, submission: completionSubmission }), 'text/markdown');
  };

  if (!capstone) {
    return (
      <div className="space-y-5">
        <Breadcrumb course={course} />
        {unlocked ? (
          <EmptyState
            title={t('capstone.noCapstone.title')}
            description={t('capstone.noCapstone.description')}
            action={
              <Button onClick={generate} disabled={generating}>
                {generating ? t('capstone.generating') : t('capstone.generate')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t('capstone.lockedTitle')}
            description={t('capstone.lockedDesc', { done: progress.done, total: progress.total })}
            action={
              <Link to={`/course/${course.id}`}>
                <Button variant="secondary">{t('capstone.backToLessons')}</Button>
              </Link>
            }
          />
        )}
        <ErrorNotice error={error || gen.error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Breadcrumb course={course} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{t('capstone.title')}</h1>
          {unlocked ? <Badge tone="success">{t('capstone.unlocked')}</Badge> : <Badge tone="neutral">{t('capstone.locked')}</Badge>}
        </div>
        {completed && <Badge tone="success">🎓 {t('capstone.verdictComplete')}</Badge>}
      </div>

      <ArtifactCard artifact={capstone.artifact} />

      {!unlocked && (
        <Card className="space-y-2">
          <p className="text-sm">{t('capstone.readAnyway')}</p>
          <Progress value={progress.pct} label={t('common.lessonsDoneShort', { done: progress.done, total: progress.total })} />
          <p className="text-xs text-neutral-500">
            {t('common.lessonsDone', { done: progress.done, total: progress.total })} — {t('capstone.lockedHint')}
          </p>
        </Card>
      )}

      {completed && (
        <CompletionPanel
          course={course}
          capstone={capstone}
          submission={completionSubmission}
          attempts={submissions.length}
          onExport={exportCompletion}
        />
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">{t('capstone.brief')}</h2>
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <Markdown>{capstone.brief_md}</Markdown>
        </div>
      </Card>

      <Card>
        <RubricList rubric={capstone.rubric} />
      </Card>

      {latest && (
        <ReviewPanel review={latest.review} testResults={latest.testResults} verdict={latest.verdict} />
      )}

      {unlocked && (
        <>
          {external && latest && latest.verdict !== 'course_complete' && (
            <Card className="space-y-2">
              <p className="text-sm">{t('externalEvidence.reviseHint')}</p>
              {revisionTarget === latest.id ? (
                <Badge tone="accent">{t('externalEvidence.revisingAttempt', { n: latest.attempt })}</Badge>
              ) : (
                <Button onClick={() => setRevisionTarget(latest.id)}>{t('externalEvidence.revise')}</Button>
              )}
            </Card>
          )}

          {external && (
            <section aria-label={t('externalEvidence.evidenceSectionTitle')}>
              <ExternalEvidenceForm
                result={evidenceResult}
                onChange={setEvidenceResult}
                submittedFiles={submittedFiles}
                writeup={draft}
                busy={submitting || gen.status === 'streaming'}
                error={error}
                onDismissError={() => setError(null)}
              />
            </section>
          )}

          <SubmissionForm
            programming={course.kind === 'programming'}
            workspaceFiles={workspaceFiles}
            onSubmit={submit}
            busy={submitting || gen.status === 'streaming'}
            error={error || gen.error || runnerError}
            onDismissError={() => {
              setError(null);
              setRunnerError(null);
            }}
            external={evidenceMode === 'external'}
            spec={spec}
            onSpecChange={setSpec}
            onDraftChange={setDraft}
            evidenceReady={Boolean(evidenceResult.confirmed && evidenceResult.evidence)}
            evidenceLabel={`${evidenceResult.evidence?.format ?? ''} · ${evidenceResult.evidence?.stats?.passed ?? 0}/${evidenceResult.evidence?.stats?.total ?? 0}`}
          />
          <TutorPanel lesson={tutorLesson} course={course} capstone capstoneBrief={capstone.brief_md} />
        </>
      )}

      <SubmissionHistory submissions={submissions} />
    </div>
  );
}

function Breadcrumb({ course }) {
  return (
    <nav className="text-xs text-neutral-500">
      <Link to="/" className="hover:underline">
        Home
      </Link>{' '}
      /{' '}
      <Link to={`/course/${course.id}`} className="hover:underline">
        {course.title}
      </Link>{' '}
      / Capstone
    </nav>
  );
}
