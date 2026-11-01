/**
 * Vietnamese variant of the Boki 3級 template. Structurally identical to `boki-journal-3.js`: same
 * lessons, exercises, charts and answer keys; every gloss, hint, quiz and lesson body is Vietnamese,
 * while Japanese prompts, lesson names and account names stay Japanese.
 */

/** Account glosses for this variant. Japanese names are never translated. */
const GLOSS = {
  現金: 'Tiền mặt',
  普通預金: 'Tiền gửi không kỳ hạn',
  売掛金: 'Phải thu khách hàng',
  貸付金: 'Tiền cho vay',
  買掛金: 'Phải trả người bán',
  借入金: 'Tiền vay',
  預り金: 'Tiền giữ lại (thuế khấu trừ)',
  売上: 'Doanh thu bán hàng',
  仕入: 'Mua hàng',
  地代家賃: 'Tiền thuê nhà, đất',
  水道光熱費: 'Chi phí điện nước',
  通信費: 'Chi phí liên lạc',
  消耗品費: 'Chi phí văn phòng phẩm',
  給料: 'Tiền lương',
};

/**
 * @param {string} id
 * @param {{ prompt: string, gloss: string, debit: [string, number][], credit: [string, number][], chart: string[], hints: string[] }} input
 */
function exercise(id, { prompt, gloss, debit, credit, chart, hints }) {
  const toRows = (rows) => rows.map(([account, amount]) => ({ account, amount }));
  return {
    version: 1,
    type: 'journal-entry',
    id,
    prompt,
    promptGloss: gloss,
    accounts: chart.map((name) => ({ name, gloss: GLOSS[name] })),
    answer: { debit: toRows(debit), credit: toRows(credit) },
    hints,
  };
}

const LESSON_1 = {
  title: '現金・預金 — Tiền mặt và tiền gửi ngân hàng',
  summary: 'Tiền mặt và tiền gửi đều là tài sản: ghi phần tăng và phần giảm của chúng.',
  content_md: `# 現金・預金 — Tiền mặt và tiền gửi ngân hàng

## Bài này học gì

Hai tài khoản gánh phần lớn các giao dịch tiền hằng ngày: 現金 (tiền mặt tại quỹ) và 普通預金 (tài
khoản tiền gửi không kỳ hạn). Cả hai đều là **tài sản**, nên cùng một quy tắc quyết định mọi bút
toán: tài sản tăng ghi bên Nợ, tài sản giảm ghi bên Có.

## ポイント (điểm chính)

- Tiền vào quỹ làm 現金 tăng → ghi bên Nợ.
- Tiền ra khỏi quỹ làm 現金 giảm → ghi bên Có.
- Chuyển tiền giữa quỹ và ngân hàng không làm thay đổi tổng tài sản: một tài sản tăng, một giảm.
- Mua hàng để bán lại theo phương pháp ba tài khoản (三分法): giá mua là chi phí ngay khi mua, không
  treo như tài sản chờ bán.

## Ví dụ

Doanh nghiệp trả 18.000 yên tiền mặt cho bảo hiểm hoả hoạn một năm.

- Bảo hiểm là chi phí của kỳ này → ghi Nợ 保険料 18.000
- Tiền mặt ra khỏi quỹ, tài sản giảm → ghi Có 現金 18.000

## よくある間違い (lỗi thường gặp)

- Ghi khoản gửi tiền vào ngân hàng là doanh thu. Chuyển tiền không tạo ra doanh thu.
- Ghi giá mua hàng như một tài sản. Theo 三分法, giá mua được ghi vào chi phí ngay khi mua.

## Tóm lại

Với mỗi giao dịch, hãy hỏi hai câu: *tài sản nào đã dịch chuyển, và theo hướng nào?* Rồi kiểm tra hai
bên có bằng nhau trước khi rời trang.`,
  quiz_seed: [
    {
      question: 'Bán hàng thu tiền mặt. Tài khoản nào nằm bên Có?',
      options: ['売上', '売掛金', '仕入', '買掛金'],
      answerIndex: 0,
      explanation: 'Bán thu tiền ngay: tiền mặt vào bên Nợ, doanh thu (売上) bên Có.',
    },
    {
      question: 'Rút tiền mặt từ tài khoản tiền gửi không kỳ hạn. Tài khoản nào nằm bên Nợ?',
      options: ['現金', '普通預金', '借入金', '貸付金'],
      answerIndex: 0,
      explanation: 'Tiền mặt tại quỹ tăng nên ghi Nợ; tiền gửi giảm nên ghi Có.',
    },
    {
      question: 'Mua hàng và trả bằng tiền mặt. Tài khoản nào nằm bên Nợ?',
      options: ['仕入', '売上', '現金', '買掛金'],
      answerIndex: 0,
      explanation: 'Theo 三分法, giá mua hàng để bán lại là chi phí (仕入) ghi bên Nợ.',
    },
  ],
  exercises: [
    exercise('l1-e1', {
      prompt: '商品 50,000 円を現金で売り上げた。',
      gloss: 'Bán hàng 50.000 yên, thu tiền mặt.',
      debit: [['現金', 50000]],
      credit: [['売上', 50000]],
      chart: ['現金', '売上', '普通預金', '仕入', '売掛金', '買掛金'],
      hints: [
        'Hãy xác định doanh nghiệp đã nhận được gì và đã trao đi gì trong giao dịch này.',
        'Phần nhận được là tài sản (bên Nợ); phần doanh nghiệp thu được nhờ trao đi hàng hoá là doanh thu (bên Có).',
        'Tiền được thanh toán ngay nên không phát sinh quyền thu tiền sau này.',
      ],
    }),
    exercise('l1-e2', {
      prompt: '銀行の普通預金口座から現金 100,000 円を引き出した。',
      gloss: 'Rút 100.000 yên tiền mặt từ tài khoản tiền gửi không kỳ hạn.',
      debit: [['現金', 100000]],
      credit: [['普通預金', 100000]],
      chart: ['現金', '普通預金', '売掛金', '買掛金', '借入金', '貸付金'],
      hints: [
        'Tiền chỉ dịch chuyển giữa hai nơi doanh nghiệp đang giữ tiền.',
        'Cả phần tăng và phần giảm đều là tài sản; tài sản tăng ghi bên Nợ.',
        'Phần về quỹ tăng lên, phần còn ở ngân hàng giảm đi.',
      ],
    }),
    exercise('l1-e3', {
      prompt: '現金 80,000 円を普通預金口座に預け入れた。',
      gloss: 'Gửi 80.000 yên tiền mặt vào tài khoản tiền gửi không kỳ hạn.',
      debit: [['普通預金', 80000]],
      credit: [['現金', 80000]],
      chart: ['現金', '普通預金', '売掛金', '買掛金', '借入金', '貸付金'],
      hints: [
        'Đây là giao dịch ngược với việc rút tiền từ ngân hàng.',
        'Bên tăng ghi bên Nợ, bên giảm ghi bên Có.',
        'Phần đã gửi vào vẫn là tài sản bạn dùng được sau này.',
      ],
    }),
    exercise('l1-e4', {
      prompt: '商品 60,000 円を仕入れ、代金は現金で支払った。',
      gloss: 'Mua hàng 60.000 yên, thanh toán bằng tiền mặt.',
      debit: [['仕入', 60000]],
      credit: [['現金', 60000]],
      chart: ['仕入', '現金', '売上', '普通預金', '売掛金', '買掛金', '消耗品費'],
      hints: [
        'Hàng hoá được nhận về và thanh toán ngay tại chỗ.',
        'Giá trị hàng mua là chi phí (bên Nợ); việc trả tiền làm giảm tài sản (bên Có).',
        'Theo phương pháp ba tài khoản, hàng mua để bán lại được ghi vào chi phí ngay khi mua, không theo dõi như tài sản.',
      ],
    }),
  ],
};

const LESSON_2 = {
  title: '商品売買・掛取引 — Mua bán hàng hoá và giao dịch ghi nợ',
  summary: 'Bán và mua chịu tạo ra quyền thu hoặc nghĩa vụ trả; thanh toán là một bút toán thứ hai.',
  content_md: `# 商品売買・掛取引 — Mua bán hàng hoá và giao dịch ghi nợ

## Bài này học gì

Phần lớn giao dịch giữa doanh nghiệp diễn ra theo hình thức ghi nợ. Việc bán và việc thu tiền xảy ra
ở hai thời điểm khác nhau, nên mỗi giao dịch tạo ra hai bút toán: một khi hàng đổi chủ, một khi tiền
đi theo.

## ポイント (điểm chính)

- Bán chịu: quyền thu tiền là tài sản (売掛金, bên Nợ); phần đã bán là doanh thu (売上, bên Có).
- Mua chịu: giá mua là chi phí (仕入, bên Nợ); nghĩa vụ trả tiền là nợ phải trả (買掛金, bên Có).
- Thu tiền hoặc trả tiền sau đó chỉ chuyển dịch tài sản với một quyền thu hoặc một nghĩa vụ — không
  phát sinh doanh thu hay chi phí mới.
- Hàng trả lại thì ghi ngược bút toán ban đầu cho phần bị trả.

## Ví dụ

Doanh nghiệp bán chịu 150.000 yên, sau đó thu tiền vào tài khoản ngân hàng.

1. Khi bán: Nợ 売掛金 150.000 / Có 売上 150.000
2. Khi thu tiền: Nợ 普通預金 150.000 / Có 売掛金 150.000

## よくある間違い (lỗi thường gặp)

- Ghi doanh thu lần thứ hai khi khách trả tiền.
- Ghi chi phí lần nữa khi thanh toán khoản phải trả.

## Tóm lại

Hãy hỏi tiền chuyển động khi nào: ngay, sau này, hay không bao giờ (trả lại hàng). Câu trả lời quyết
định bạn ghi một quyền thu mới, tất toán một nghĩa vụ cũ, hay ghi ngược bút toán.`,
  quiz_seed: [
    {
      question: 'Bán hàng chịu. Tài khoản nào nằm bên Có?',
      options: ['売上', '売掛金', '買掛金', '現金'],
      answerIndex: 0,
      explanation: 'Bán chịu vẫn ghi doanh thu 売上; quyền thu 売掛金 nằm bên Nợ.',
    },
    {
      question: 'Mua hàng chịu. Tài khoản nào nằm bên Có?',
      options: ['買掛金', '売掛金', '仕入', '現金'],
      answerIndex: 0,
      explanation: 'Nghĩa vụ trả sau là 買掛金 (nợ phải trả); 仕入 là chi phí bên Nợ.',
    },
    {
      question: 'Thu khoản phải thu vào tài khoản tiền gửi không kỳ hạn. Tài khoản nào nằm bên Có?',
      options: ['売掛金', '普通預金', '売上', '現金'],
      answerIndex: 0,
      explanation: 'Thu được tiền thì quyền thu biến mất, nên 売掛金 ghi bên Có.',
    },
  ],
  exercises: [
    exercise('l2-e1', {
      prompt: '商品 120,000 円を売り上げ、代金は掛けとした。',
      gloss: 'Bán hàng 120.000 yên, khách hàng chưa thanh toán.',
      debit: [['売掛金', 120000]],
      credit: [['売上', 120000]],
      chart: ['売掛金', '売上', '買掛金', '仕入', '現金', '普通預金'],
      hints: [
        'Hàng đã giao đi nhưng tiền chưa thu về.',
        'Quyền thu tiền sau này là tài sản (bên Nợ); phần hàng đã bán là doanh thu (bên Có).',
        'Thứ nhận được hôm nay là quyền thu tiền, không phải tiền.',
      ],
    }),
    exercise('l2-e2', {
      prompt: '商品 90,000 円を仕入れ、代金は掛けとした。',
      gloss: 'Mua hàng 90.000 yên, chưa thanh toán cho người bán.',
      debit: [['仕入', 90000]],
      credit: [['買掛金', 90000]],
      chart: ['仕入', '買掛金', '売上', '売掛金', '現金', '普通預金'],
      hints: [
        'Hàng đã nhận về nhưng tiền chưa trả.',
        'Giá trị hàng mua là chi phí (bên Nợ); nghĩa vụ trả tiền sau là nợ phải trả (bên Có).',
        'Theo phương pháp ba tài khoản, chi phí hàng mua được ghi nhận ngay khi mua thay vì theo dõi như tài sản.',
      ],
    }),
    exercise('l2-e3', {
      prompt: '売掛金 120,000 円を普通預金口座で回収した。',
      gloss: 'Thu 120.000 yên khoản phải thu vào tài khoản tiền gửi không kỳ hạn.',
      debit: [['普通預金', 120000]],
      credit: [['売掛金', 120000]],
      chart: ['普通預金', '売掛金', '現金', '買掛金', '売上', '仕入'],
      hints: [
        'Quyền thu tiền đã ghi trước đó nay chuyển thành tiền.',
        'Tài sản nhận về ghi bên Nợ; quyền thu tiền mất đi ghi bên Có.',
        'Doanh thu đã ghi nhận ở giao dịch bán nên lần này không tăng thêm.',
      ],
    }),
    exercise('l2-e4', {
      prompt: '買掛金 90,000 円を普通預金口座から支払った。',
      gloss: 'Thanh toán 90.000 yên khoản phải trả người bán từ tài khoản tiền gửi không kỳ hạn.',
      debit: [['買掛金', 90000]],
      credit: [['普通預金', 90000]],
      chart: ['買掛金', '普通預金', '現金', '売掛金', '売上', '仕入'],
      hints: [
        'Nghĩa vụ đã ghi trước đó nay được thanh toán.',
        'Nợ phải trả mất đi ghi bên Nợ; tài sản chi ra ghi bên Có.',
        'Chi phí hàng mua đã ghi nhận ở giao dịch mua nên lần này không tăng thêm.',
      ],
    }),
    exercise('l2-e5', {
      prompt: '掛けで売り上げた商品のうち 10,000 円分が返品された。',
      gloss: 'Khách hàng trả lại 10.000 yên hàng đã bán chịu.',
      debit: [['売上', 10000]],
      credit: [['売掛金', 10000]],
      chart: ['売上', '売掛金', '仕入', '買掛金', '現金', '普通預金'],
      hints: [
        'Một phần giao dịch bán trước đó bị huỷ.',
        'Ghi ngược lại bút toán ban đầu: giảm doanh thu và giảm quyền thu tiền từ khách hàng.',
        'Khách hàng không còn nợ phần hàng trả lại nên số tiền phải thu giảm xuống.',
      ],
    }),
  ],
};

const LESSON_3 = {
  title: '経費・その他 — Chi phí và các giao dịch khác',
  summary: 'Chi phí trong kỳ, bút toán nhiều dòng và những giao dịch không phải doanh thu.',
  content_md: `# 経費・その他 — Chi phí và các giao dịch khác

## Bài này học gì

Chi phí là những khoản đã dùng hết trong kỳ: tiền thuê, điện nước, tiền lương, văn phòng phẩm. Có
giao dịch tác động đến nhiều tài khoản cùng lúc, và có giao dịch chỉ làm thay đổi cơ cấu tài sản.

## ポイント (điểm chính)

- Chi phí của kỳ ghi bên Nợ; phần đã trao đi ghi bên Có.
- Bút toán nhiều dòng chỉ là nhiều dòng ở một bên. Mỗi dòng bên Nợ vẫn phải được cân bởi bên Có.
- Thuế khấu trừ từ tiền lương không phải tiền của nhân viên: doanh nghiệp giữ để nộp thuế nên đó là
  nợ phải trả cho đến khi nộp.
- Vay tiền làm tăng tài sản và tăng nợ phải trả cùng một lượng; không bao giờ là doanh thu.

## Ví dụ

Doanh nghiệp trả 40.000 yên tiền lương, khấu trừ 4.000 yên thuế, phần còn lại trả bằng tiền mặt.

- Nợ 給料 40.000 (toàn bộ chi phí của kỳ)
- Có 預り金 4.000 (giữ để nộp thuế) và 現金 36.000 (thực trả)

## よくある間違い (lỗi thường gặp)

- Chỉ ghi phần tiền mặt thực trả và làm mất toàn bộ chi phí tiền lương.
- Coi khoản vay là doanh thu vì có tiền vào.

## Tóm lại

Hãy tính tổng chi phí trước, rồi tách bên Có thành phần đã trao đi và phần giữ lại.`,
  quiz_seed: [
    {
      question: 'Trả lương, khấu trừ thuế thu nhập và trả phần còn lại bằng tiền mặt. Phần khấu trừ nằm bên Có ở tài khoản nào?',
      options: ['預り金', '給料', '現金', '借入金'],
      answerIndex: 0,
      explanation: 'Thuế khấu trừ là khoản giữ hộ nên ghi 預り金 bên Có.',
    },
    {
      question: 'Trả tiền thuê văn phòng. Tài khoản nào nằm bên Nợ?',
      options: ['地代家賃', '水道光熱費', '消耗品費', '通信費'],
      answerIndex: 0,
      explanation: 'Tiền thuê nhà là chi phí 地代家賃, ghi bên Nợ.',
    },
    {
      question: 'Vay tiền từ ngân hàng. Tài khoản nào nằm bên Có?',
      options: ['借入金', '貸付金', '現金', '売上'],
      answerIndex: 0,
      explanation: 'Tiền vay phải hoàn trả nên là nợ phải trả 借入金, ghi bên Có.',
    },
  ],
  exercises: [
    exercise('l3-e1', {
      prompt: '事務所の家賃 80,000 円を現金で支払った。',
      gloss: 'Trả 80.000 yên tiền thuê nhà, đất của văn phòng bằng tiền mặt.',
      debit: [['地代家賃', 80000]],
      credit: [['現金', 80000]],
      chart: ['地代家賃', '現金', '普通預金', '水道光熱費', '通信費', '消耗品費', '売上'],
      hints: [
        'Doanh nghiệp đã dùng một dịch vụ và trả tiền ngay.',
        'Chi phí thuộc kỳ này ghi bên Nợ; việc trả tiền làm giảm tài sản (bên Có).',
        'Lợi ích đã dùng hết trong kỳ nên không trở thành tài sản.',
      ],
    }),
    exercise('l3-e2', {
      prompt: '水道光熱費 12,000 円を普通預金口座から支払った。',
      gloss: 'Trả 12.000 yên chi phí điện nước từ tài khoản tiền gửi không kỳ hạn.',
      debit: [['水道光熱費', 12000]],
      credit: [['普通預金', 12000]],
      chart: ['水道光熱費', '普通預金', '現金', '地代家賃', '通信費', '消耗品費'],
      hints: [
        'Giao dịch giống việc trả tiền thuê nhà, chỉ khác phương thức thanh toán.',
        'Chi phí ghi bên Nợ; tiền gửi giảm đi ghi bên Có.',
        'Tiền ra khỏi tài khoản ngân hàng chứ không phải quỹ tiền mặt.',
      ],
    }),
    exercise('l3-e3', {
      prompt: '給料 300,000 円のうち所得税の預り金 20,000 円を差し引き、残額を現金で支払った。',
      gloss: 'Tiền lương 300.000 yên, khấu trừ 20.000 yên thuế thu nhập giữ lại, phần còn lại trả bằng tiền mặt.',
      debit: [['給料', 300000]],
      credit: [
        ['預り金', 20000],
        ['現金', 280000],
      ],
      chart: [
        '給料',
        '預り金',
        '現金',
        '普通預金',
        '借入金',
        '貸付金',
        '売掛金',
        '買掛金',
      ],
      hints: [
        'Một lần trả tiền nhưng giải quyết hai đối tượng cùng lúc.',
        'Chi phí ghi bên Nợ; bên Có tách thành phần thực trả và phần giữ lại.',
        'Số nhân viên thực nhận cộng số giữ lại để nộp thuế bằng tổng số phải trả cho người lao động.',
      ],
    }),
    exercise('l3-e4', {
      prompt: '銀行から 200,000 円を借り入れ、現金で受け取った。',
      gloss: 'Vay 200.000 yên từ ngân hàng và nhận bằng tiền mặt.',
      debit: [['現金', 200000]],
      credit: [['借入金', 200000]],
      chart: ['現金', '借入金', '普通預金', '貸付金', '預り金', '売掛金'],
      hints: [
        'Doanh nghiệp nhận tiền đồng thời phát sinh nghĩa vụ trả lại.',
        'Tài sản tăng ghi bên Nợ; nợ phải trả tăng ghi bên Có.',
        'Khoản này phải hoàn trả nên không phải doanh thu.',
      ],
    }),
    exercise('l3-e5', {
      prompt: '事務用品 15,000 円と通信費 5,000 円を現金で支払った。',
      gloss: 'Trả 15.000 yên văn phòng phẩm và 5.000 yên chi phí liên lạc bằng tiền mặt.',
      debit: [
        ['消耗品費', 15000],
        ['通信費', 5000],
      ],
      credit: [['現金', 20000]],
      chart: ['消耗品費', '通信費', '現金', '普通預金', '地代家賃', '水道光熱費', '給料'],
      hints: [
        'Một lần trả tiền cho hai loại chi phí khác nhau.',
        'Mỗi chi phí ghi một dòng bên Nợ; lần trả tiền chỉ ghi một dòng bên Có.',
        'Cộng hai khoản chi phí trước, rồi kiểm tra bên Có có khớp tổng đó không.',
      ],
    }),
  ],
};

export const BOKI_TEMPLATE_VI = {
  id: 'boki-journal-3',
  title: 'Boki 3級 — 仕訳 cơ bản',
  description:
    'Luyện 仕訳 (bút toán) theo chương trình Kế toán Nhật Bản cấp 3: tiền mặt và tiền gửi, mua bán hàng hoá và ghi nợ, chi phí và các giao dịch khác. Ba bài học, 14 bài tập có chấm điểm và gợi ý, không cần API key.',
  level: 'Beginner',
  kind: 'skill',
  goal: 'Ghi đúng bút toán Nợ/Có cho các giao dịch hằng ngày theo chuẩn 簿記3級.',
  topics: ['bookkeeping', 'journal entries', '簿記3級'],
  language: 'vi',
  lessons: [LESSON_1, LESSON_2, LESSON_3],
};
