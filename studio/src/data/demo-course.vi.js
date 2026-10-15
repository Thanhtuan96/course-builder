/**
 * Vietnamese variant of the bundled demo course (LANG-02). Same shape as `demo-course.js`; the
 * seeder picks it when the learning language is Vietnamese so a first-run learner sees a demo in
 * their own language. Kept structurally identical so `seedDemoCourse` treats both the same way.
 */

const L1 = `# Học tập thật sự diễn ra như thế nào

## Khái niệm

Học không phải là đọc — mà là **truy hồi**. Não bạn củng cố một ký ức mỗi lần bạn kéo nó ra,
chứ không phải mỗi lần bạn nhét nó vào. Hai thói quen làm phần lớn công việc:

- **Truy hồi chủ động** — gấp sách lại và thử tái tạo ý tưởng từ ký ức.
- **Lặp lại cách quãng** — ôn lại đúng lúc bạn sắp quên.

Đọc lại có cảm giác hiệu quả vì nó *quen thuộc*, nhưng quen thuộc không phải là hiểu.

## Ví dụ thực tế

Một sinh viên y đọc lại một chương ba lần và trong kỳ thi chẳng nhớ được gì. Một bạn cùng lớp
đọc một lần, rồi che trang lại và nói to những gì mình nhớ. Người thứ hai tốn ít thời gian hơn
mà nhớ nhiều hơn hẳn — vì bạn ấy luyện *truy hồi*, không phải *nạp vào*.

## Bài tập

Chọn một ý bạn học tuần này. Đóng mọi thứ lại và viết ra từ ký ức:

1. ý đó trong một câu,
2. một ví dụ cụ thể,
3. một điều nó *không* có nghĩa.

Sau đó mở ghi chú và xem bạn bỏ sót gì. Khoảng trống đó chính là danh sách cần học thật sự.`;

const L2 = `# Đặt câu hỏi tốt hơn

## Khái niệm

Chất lượng điều bạn học bám theo chất lượng câu hỏi bạn đặt. Câu hỏi tốt thì:

- **Cụ thể** — "vì sao vòng lặp bỏ qua phần tử cuối?" tốt hơn "vòng lặp hoạt động thế nào?"
- **Có thể kiểm chứng** — bạn mô tả được một câu trả lời sẽ trông như thế nào.
- **Có tầng bậc** — chúng hướng tới khái niệm trước, rồi mẫu hình, rồi chi tiết.

## Ví dụ thực tế

Hai người cùng gỡ lỗi một hàm hỏng. Một người hỏi "sao cái này hỏng?" và chờ được giúp. Người
kia hỏi "lỗi nằm ở biên phải không — lần lặp đầu, lần lặp cuối, hay đầu vào rỗng?" và thu hẹp
phạm vi ngay. Cùng một vấn đề, tốc độ rất khác.

## Bài tập

Lấy một chủ đề bạn thấy rối. Viết ba câu hỏi về nó: một về *khái niệm*, một về *mẫu hình* bạn
sẽ theo, và một về *trường hợp biên* khiến bạn bất ngờ. Chưa cần trả lời — chỉ để ý xem mô hình
trong đầu bạn đã sắc nét hơn bao nhiêu.`;

const L3 = `# Học từ sai lầm

## Khái niệm

Sai lầm là một **tín hiệu**, không phải một phán quyết. Khi điều gì đó thất bại, hãy tách ba thứ:

- **mục tiêu** (bạn muốn gì),
- **nỗ lực** (bạn đã làm gì),
- **khoảng cách** (thực tế đã khác thế nào).

Phần lớn việc học diễn ra trong khoảng cách. Gọi tên nó biến một thất bại bực bội thành bước tiếp
theo chính xác.

## Ví dụ thực tế

Ứng dụng thẻ ghi nhớ của một người cứ lên lịch các thẻ quá xa trong tương lai. Thay vì nói "mình
dốt code", cô gọi tên khoảng cách: "Mình cập nhật khoảng thời gian nhưng chưa bao giờ tính lại ngày
đến hạn." Một câu đó chỉ đúng thứ cần sửa.

## Bài tập

Nhớ lại sai lầm gần nhất của bạn (bất kỳ việc gì). Viết mục tiêu, nỗ lực và khoảng cách, mỗi thứ một
dòng. Rồi viết thí nghiệm tiếp theo *nhỏ nhất* có thể kiểm chứng lời giải thích của bạn về khoảng cách.`;

const L4 = `# Xây dựng thói quen hằng ngày

## Khái niệm

Đều đặn thắng cường độ. Một phiên ngắn hằng ngày giữ ký ức trên đường cong lãng quên; nhồi nhét
xây lại chúng từ đầu mỗi lần. Hướng tới một **phiên tối thiểu khả thi**: 10–15 phút truy hồi tài
liệu đến hạn, mỗi ngày.

## Ví dụ thực tế

Hai người đều học tổng cộng mười giờ. Một người nhồi một lần năm tiếng, người kia 15 phút mỗi ngày.
Một tháng sau, người học hằng ngày vẫn nhớ phần lớn; người nhồi chỉ nhớ mảnh vụn.

## Bài tập

Thiết kế phiên tối thiểu khả thi của bạn. Trả lời:

1. Bạn sẽ làm vào lúc nào, và điều gì kích hoạt nó (sau khi uống cà phê, trước bữa trưa)?
2. Phiên nhỏ nhất mà vẫn tính là đã học trong một ngày tệ là gì (một thẻ? một lần tóm tắt)?
3. Bạn đánh dấu đã làm thế nào — một chuỗi ngày, một dấu tích trên giấy?

Hãy để nó nhỏ đến mức buồn cười. Bạn luôn có thể làm nhiều hơn, chứ không ít hơn.`;

const CAPSTONE_BRIEF = `# 🏗️ Capstone: Sổ tay học tập cá nhân của bạn

**Hãy tạo ra sản phẩm.** Đây không phải bài kiểm tra — bạn đang làm một thứ thật, hữu ích mà bạn có
thể giữ và đưa cho một người bạn.

## Bạn sẽ tạo ra gì

Một **sổ tay học tập cá nhân một trang** ghi lại cách *bạn* sẽ học từ giờ: nghi thức truy hồi, thói
quen đặt câu hỏi, nhật ký sai lầm và phiên học hằng ngày — kèm một suy ngẫm ngắn sau khi thử vài ngày.

## Bạn đang chứng minh điều gì

Khi tạo ra sản phẩm này, bạn cho thấy mình có thể:
- Thiết kế và chạy luyện truy hồi chủ động thật sự bền.
- Đặt câu hỏi cụ thể, có thể kiểm chứng, có tầng bậc khi bí.
- Biến một sai lầm thành khoảng cách có tên và thí nghiệm tiếp theo.
- Cam kết một phiên học hằng ngày tối thiểu và đánh dấu trung thực.

## Phạm vi

### Cần xây gì
Một trang duy nhất (Markdown, một tài liệu, hoặc một thẻ in được) với bốn phần có nhãn rõ ràng, và
một suy ngẫm khoảng 150–300 từ về điều đã xảy ra khi bạn dùng nó.

### Tính năng chính (bắt buộc)
- [ ] **Nghi thức truy hồi** — thói quen bạn sẽ dùng và dấu hiệu kích hoạt nó.
- [ ] **Thói quen đặt câu hỏi** — ba mẫu câu hỏi bạn sẽ dùng lại (khái niệm → mẫu hình → trường hợp biên).
- [ ] **Nhật ký sai lầm** — một mẫu tách mục tiêu, nỗ lực và khoảng cách.
- [ ] **Phiên tối thiểu khả thi** — phiên hằng ngày nhỏ nhất, dấu hiệu kích hoạt và cách đánh dấu.

### Mục tiêu mở rộng
- [ ] Dùng nó một tuần và thêm ghi chú trước/sau ngắn.
- [ ] Biến hai dòng trong sổ tay thành thẻ ghi nhớ để ôn.

## Quy tắc
- Tự làm **hoàn toàn một mình** — không nhờ AI viết hộ.
- Bạn được dùng tài liệu, bài báo và công cụ ghi chú thoải mái.
- Bạn được dùng gia sư để bàn một **khái niệm**, nhưng không để xin gợi ý hay bản nháp.
- Không gợi ý, không danh sách bước, không code — đây là bằng chứng của bạn.

## Định nghĩa hoàn thành
- [ ] Cả bốn phần đều có mặt và đặc thù cho bạn (không phải lời khuyên chung chung).
- [ ] Sổ tay đủ ngắn để thật sự dùng (khoảng một trang).
- [ ] Suy ngẫm nêu một điều hiệu quả và một khoảng cách bạn nhận ra.
- [ ] Bạn giải thích được từng dòng nếu được hỏi.

## Nộp bài
Chia sẻ sổ tay của bạn (dán vào, liên kết tài liệu, hoặc mô tả) và phần suy ngẫm để được đánh giá.`;

const CAPSTONE_RUBRIC = [
  { name: 'Nghi thức truy hồi cụ thể', solid: 'Nêu một thói quen truy hồi chủ động cụ thể VÀ dấu hiệu/thời điểm kích hoạt, không chỉ "mình sẽ ôn nhiều hơn".' },
  { name: 'Câu hỏi cụ thể và có tầng bậc', solid: 'Ba mẫu câu hỏi dùng lại được, đi từ khái niệm đến mẫu hình đến trường hợp biên, mỗi mẫu có ví dụ.' },
  { name: 'Nhật ký sai lầm tách mục tiêu/nỗ lực/khoảng cách', solid: 'Một mẫu thật sự biến thất bại thành khoảng cách có tên và thí nghiệm tiếp theo nhỏ nhất.' },
  { name: 'Phiên tối thiểu khả thi thực tế', solid: 'Một phiên đủ nhỏ cho ngày tệ, có dấu hiệu kích hoạt và cách đánh dấu nhìn thấy được.' },
  { name: 'Suy ngẫm cho thấy dùng thật', solid: 'Một suy ngẫm ngắn nêu một điều hiệu quả và một khoảng cách thật — cụ thể, không khen chung chung.' },
];

export const DEMO_CAPSTONE = {
  kind: 'conceptual',
  brief_md: CAPSTONE_BRIEF,
  rubric: CAPSTONE_RUBRIC,
  artifact: {
    title: 'Sổ tay học tập cá nhân',
    deliverable: 'Một sổ tay học tập một trang (nghi thức truy hồi, thói quen đặt câu hỏi, nhật ký sai lầm, phiên học hằng ngày) kèm một suy ngẫm ngắn khi dùng nó.',
    definitionOfDone: [
      'Cả bốn phần đều có và đặc thù cho bạn.',
      'Sổ tay đủ ngắn để thật sự dùng.',
      'Suy ngẫm nêu một điều hiệu quả và một khoảng cách.',
      'Bạn có thể đưa cho bạn bè và họ làm theo được.',
    ],
  },
};

export const DEMO_COURSE_VI = {
  title: 'Học bất cứ điều gì cùng Professor',
  description: 'Khoá học bốn bài về cách học cách học — truy hồi chủ động, đặt câu hỏi tốt, học từ sai lầm và thói quen hằng ngày.',
  level: 'Beginner',
  goal: 'Xây dựng một thói quen học dựa trên bằng chứng, lặp lại được.',
  topics: ['học tập', 'kỹ năng học', 'trí nhớ'],
  source: 'demo',
  language: 'vi',
  artifact: DEMO_CAPSTONE.artifact,
  lessons: [
    {
      title: 'Học tập thật sự diễn ra như thế nào',
      summary: 'Truy hồi chủ động và lặp lại cách quãng thắng việc đọc lại.',
      content_md: L1,
      quiz_seed: [
        { question: 'Điều gì củng cố ký ức mạnh nhất?', options: ['Đọc lại trang nhiều lần', 'Kéo ý tưởng ra khỏi ký ức', 'Tô sáng các câu chính', 'Đọc chậm'], answerIndex: 1, explanation: 'Truy hồi (truy hồi chủ động) củng cố ký ức mạnh hơn hẳn việc nạp thụ động.' },
        { question: 'Vì sao đọc lại có cảm giác hiệu quả nhưng lại kém?', options: ['Vì quá chậm', 'Vì nó tạo cảm giác quen thuộc, không phải truy hồi', 'Vì dùng sai cơ mắt', 'Vì cần phòng yên tĩnh'], answerIndex: 1, explanation: 'Quen thuộc bị nhầm với hiểu; thứ được kiểm tra là truy hồi.' },
        { question: 'Lặp lại cách quãng nghĩa là ôn tài liệu…', options: ['chỉ một lần', 'đúng lúc bạn sắp quên', 'mỗi giờ mãi mãi', 'chỉ khi bạn muốn'], answerIndex: 1, explanation: 'Các lần ôn đúng gần điểm quên là hiệu quả nhất.' },
        { question: 'Danh sách cần học tốt nhất sau một lần truy hồi là…', options: ['mọi thứ bạn đã biết', 'những khoảng trống bạn bỏ sót', 'cả chương', 'ghi chú của bạn bè'], answerIndex: 1, explanation: 'Thứ bạn không truy hồi được chính là thứ cần luyện.' },
        { question: 'Cặp nào làm phần lớn công việc học?', options: ['Đọc + tô sáng', 'Truy hồi chủ động + lặp lại cách quãng', 'Tốc độ + khối lượng', 'Ghi chú + tô màu'], answerIndex: 1, explanation: 'Hai thói quen đó chi phối bằng chứng.' },
      ],
    },
    {
      title: 'Đặt câu hỏi tốt hơn',
      summary: 'Câu hỏi cụ thể, có thể kiểm chứng, có tầng bậc giúp học nhanh hơn.',
      content_md: L2,
      quiz_seed: [
        { question: 'Câu hỏi nào tốt hơn?', options: ['Vòng lặp hoạt động thế nào?', 'Vì sao vòng lặp bỏ qua phần tử cuối?', 'Vòng lặp là gì?', 'Vòng lặp có quan trọng không?'], answerIndex: 1, explanation: 'Câu hỏi cụ thể và có thể kiểm chứng thu hẹp phạm vi nhanh nhất.' },
        { question: 'Câu hỏi "có thể kiểm chứng" là câu mà…', options: ['bạn đã biết đáp án', 'bạn nói được một câu trả lời sẽ trông như thế nào', 'nó ngắn', 'nó nói về code'], answerIndex: 1, explanation: 'Nếu không mô tả được câu trả lời hợp lệ, câu hỏi quá mơ hồ.' },
        { question: 'Câu hỏi có tầng bậc đi theo thứ tự nào?', options: ['chi tiết → mẫu hình → khái niệm', 'khái niệm → mẫu hình → trường hợp biên', 'trường hợp biên → khái niệm → mẫu hình', 'ngẫu nhiên'], answerIndex: 1, explanation: 'Bắt đầu từ khái niệm, rồi mẫu hình, rồi trường hợp biên.' },
        { question: 'Hai người gỡ lỗi: ai thu hẹp nhanh hơn?', options: ['Người hỏi "sao cái này hỏng?"', 'Người hỏi chính xác lỗi xảy ra ở đâu', 'Người hỏi bạn bè', 'Ngang nhau'], answerIndex: 1, explanation: 'Định vị lỗi tốt hơn việc xin cách sửa.' },
        { question: 'Một câu hỏi học tốt nên…', options: ['mơ hồ để linh hoạt', 'cụ thể, có thể kiểm chứng và có tầng bậc', 'chỉ trả lời được có/không', 'về nhiều chủ đề cùng lúc'], answerIndex: 1, explanation: 'Ba tính chất đó giữ câu hỏi hữu ích.' },
      ],
    },
    {
      title: 'Học từ sai lầm',
      summary: 'Gọi tên khoảng cách giữa mục tiêu, nỗ lực và thực tế.',
      content_md: L3,
      quiz_seed: [
        { question: 'Nên coi sai lầm như…', options: ['bản án về năng lực', 'một tín hiệu để điều tra', 'thứ để che giấu', 'lý do để dừng'], answerIndex: 1, explanation: 'Coi sai lầm là thông tin về khoảng cách.' },
        { question: 'Ba thứ cần tách ra sau một thất bại?', options: ['mục tiêu, nỗ lực, khoảng cách', 'thời gian, chi phí, công sức', 'quá khứ, hiện tại, tương lai', 'ai, cái gì, vì sao'], answerIndex: 0, explanation: 'Mục tiêu, nỗ lực, khoảng cách biến thất bại thành bước tiếp theo.' },
        { question: '"Mình cập nhật khoảng thời gian nhưng chưa tính lại ngày đến hạn" là ví dụ của…', options: ['một lời bào chữa', 'gọi tên khoảng cách chính xác', 'một lời phàn nàn mơ hồ', 'một mục tiêu'], answerIndex: 1, explanation: 'Gọi tên khoảng cách chỉ thẳng vào thứ cần sửa.' },
        { question: 'Bước tiếp theo sau khi gọi tên khoảng cách là…', options: ['làm lại mọi thứ', 'chạy thí nghiệm nhỏ nhất kiểm chứng lời giải thích', 'xin đáp án', 'bỏ qua'], answerIndex: 1, explanation: 'Thí nghiệm nhỏ xác nhận hoặc bác bỏ lời giải thích nhanh chóng.' },
        { question: 'Phần lớn việc học diễn ra ở…', options: ['mục tiêu', 'nỗ lực', 'khoảng cách', 'lễ ăn mừng'], answerIndex: 2, explanation: 'Khoảng cách giữa kỳ vọng và thực tế là nơi hiểu biết lớn lên.' },
      ],
    },
    {
      title: 'Xây dựng thói quen hằng ngày',
      summary: 'Một phiên tối thiểu khả thi thắng việc nhồi nhét không đều.',
      content_md: L4,
      quiz_seed: [
        { question: 'Đều đặn thắng cường độ vì…', options: ['vui hơn', 'giữ ký ức trên đường cong lãng quên', 'tốn nhiều thời gian hơn', 'không cần lập kế hoạch'], answerIndex: 1, explanation: 'Ôn ngắn hằng ngày ngăn sự phân rã mà việc nhồi nhét phải xây lại.' },
        { question: 'Phiên tối thiểu khả thi là…', options: ['phiên dài nhất bạn làm được', 'phiên nhỏ nhất mà vẫn tính là đã học', 'một ngày nghỉ', 'học nhóm'], answerIndex: 1, explanation: 'Một mức sàn tí hon giữ chuỗi ngày sống trong ngày tệ.' },
        { question: 'Dấu hiệu kích hoạt tốt cho phiên hằng ngày là…', options: ['khi nào nhớ ra', 'một thói quen sẵn có như sau khi uống cà phê', 'chỉ cuối tuần', 'khi thấy có động lực'], answerIndex: 1, explanation: 'Gắn thói quen vào một nếp sẵn có khiến nó bám trụ.' },
        { question: 'Bạn đánh dấu đã làm phiên học thế nào?', options: ['Không đánh dấu', 'Một chuỗi ngày hoặc một dấu tích trên giấy', 'Một bài nhật ký dài', 'Kể cho bạn bè'], answerIndex: 1, explanation: 'Một dấu hiệu nhìn thấy được, tốn ít công, củng cố thói quen.' },
        { question: 'Thói quen hằng ngày nên…', options: ['nhỏ đến mức buồn cười', 'dài nhất có thể', 'không ghi lại', 'chỉ làm khi hứng'], answerIndex: 0, explanation: 'Bắt đầu nhỏ; bạn luôn có thể làm nhiều hơn, chứ không ít hơn.' },
      ],
    },
  ],
  flashcards: [
    { lessonPosition: 1, front: 'Truy hồi chủ động', back: 'Tái tạo một ý từ ký ức thay vì đọc lại — kỹ thuật học mạnh nhất.' },
    { lessonPosition: 2, front: 'Điều gì tạo nên một câu hỏi học tốt?', back: 'Cụ thể, có thể kiểm chứng và có tầng bậc (khái niệm → mẫu hình → trường hợp biên).' },
    { lessonPosition: 3, front: 'Mục tiêu / nỗ lực / khoảng cách', back: 'Tách điều bạn muốn, điều bạn làm và điều thực tế xảy ra — đường nhanh nhất từ thất bại đến cách sửa.' },
  ],
};
