/**
 * Vietnamese variant of the bundled Playwright E2E course template (PW-01, D-01).
 *
 * Same shape as `playwright-e2e.js` and structurally identical to it: the seeder picks this variant
 * through `normalizeLanguage` so a Vietnamese learner never reads English lesson bodies next to a
 * Vietnamese rubric (DEBT-01 spirit, T-09-16).
 *
 * Pure data. This module imports nothing — no repo, no settings, no AI, no network. Lesson bodies
 * teach concepts and never contain a complete runnable spec or a copyable run command: the one
 * exact command lives in the evidence form (D-16).
 *
 * Literal `npx playwright test` / `import { test, expect }` / `test.describe(` appear nowhere in the
 * lesson text on purpose; `test/capstone-template.test.js` asserts it in both variants.
 */

const ARTIFACT_VI = {
  title: 'Một file kiểm thử E2E Playwright cho quy trình thật của bạn',
  deliverable:
    'Một file spec trong chính dự án của bạn phủ đúng một quy trình người dùng thật, kèm đầu ra của một lần chạy Chromium xanh.',
  definitionOfDone: [
    'Một file spec đã commit trong dự án của bạn.',
    'Chạy xanh khi chạy một mình và khi chạy cả bộ.',
    'Không có waitForTimeout, force: true hay click theo toạ độ.',
    'Có ít nhất một locator ngữ nghĩa và một assertion web-first.',
    'Dán kèm đầu ra reporter của một lần chạy Chromium với 0 lỗi.',
    'Một đoạn giải thích ngắn về locator, cách chờ và tính cô lập.',
  ],
};

const BRIEF_VI = `# 🏗️ Capstone: Bài kiểm thử E2E đầu tiên của bạn

**Nộp sản phẩm của bạn.** Đây không phải bài thi — bạn đang tạo ra một thứ thật, chạy được, dùng
được trong chính dự án của mình.

## Bạn sẽ tạo ra gì

Một **file spec duy nhất** trong dự án của bạn, phủ đúng **một quy trình thật** mà người dùng thật
sự thực hiện, cộng với **đầu ra của một lần chạy Chromium đã xanh**.

## Bạn đang chứng minh điều gì

Bạn chứng minh rằng bạn có thể:
- Chọn một quy trình người dùng quan tâm, chứ không phải một trang demo.
- Định vị phần tử theo cách người dùng nhìn thấy.
- Khẳng định đúng thứ người dùng thấy, bằng assertion tự thử lại.
- Giữ bài test cô lập và lặp lại được.
- Đọc được báo cáo của trình chạy test và giải thích nó.

## Phạm vi

### Tính năng chính (hoặc các phần bắt buộc)
- [ ] Một file spec trong dự án của bạn, cho đúng một quy trình.
- [ ] Locator ngữ nghĩa: role, label, text hoặc test id (được nối hoặc lọc khi cần).
- [ ] Ít nhất một assertion web-first làm bằng chứng chính.
- [ ] Phần chuẩn bị (đăng nhập, dữ liệu) nằm trong beforeEach, test.use hoặc storageState.
- [ ] Đầu ra reporter của lần chạy Chromium xanh, dán vào khi nộp bài.

### Mục tiêu mở rộng
- [ ] Chạy bài test theo thứ tự đảo ngược để chứng minh nó không phụ thuộc thứ tự.
- [ ] Thêm một assertion về URL sau khi hoàn tất quy trình.
- [ ] Ghi lại một lần flaky (nếu có) và giải thích nguyên nhân bạn tìm ra.

## Quy tắc
- Bài test này do **chính bạn viết**. Tài liệu, trang docs chính thức và công cụ codegen để *khám
  phá* locator đều được phép; **không dùng spec do AI viết**.
- Studio **không chạy** Playwright cho bạn. Bạn chạy trong terminal của mình rồi dán kết quả lại.
- Không dán trace, ảnh chụp màn hình hay video — chúng có thể chứa dữ liệu riêng của ứng dụng.
- Không sửa đầu ra của reporter. Nếu có lỗi, cứ nộp đúng thực tế và nói bạn đang ở đâu.

## Định nghĩa hoàn thành
- [ ] Một file spec đã commit trong dự án của bạn, phủ một quy trình người dùng thật.
- [ ] Chạy xanh khi chạy một mình, và vẫn xanh khi chạy cả bộ.
- [ ] Không có waitForTimeout, không có force: true, không click theo toạ độ.
- [ ] Có ít nhất một locator ngữ nghĩa và một assertion web-first.
- [ ] Một lần chạy Chromium với 0 lỗi (reporter JSON hoặc list) được dán vào.
- [ ] Một đoạn giải thích ngắn: vì sao chọn các locator đó, vì sao không chờ thủ công, và bài test
      cô lập ra sao.

## Nộp bài
Dán nội dung file spec, đường dẫn file trong dự án, đầu ra reporter và đoạn giải thích của bạn.
Bạn có thể nộp lại bao nhiêu lần cũng được — mỗi lần nộp và nhận xét đều được giữ lại.`;

const RUBRIC_VI = [
  {
    key: 'R1',
    name: 'Quy trình thật trong ứng dụng của bạn',
    solid:
      'Spec dẫn dắt một quy trình người dùng thật thực hiện trong chính ứng dụng của bạn (không phải trang demo, không phải bản sao của một hướng dẫn), và các bước đọc lên như ý định của người dùng.',
  },
  {
    key: 'R2',
    name: 'Định vị phần tử theo ngữ nghĩa',
    solid:
      'Định vị bằng role, label, text hoặc test id (nối hoặc lọc khi cần); không có chuỗi CSS/XPath, không nth-child, không dùng page.$ hay page.$$.',
  },
  {
    key: 'R3',
    name: 'Assertion web-first',
    solid:
      'Dùng assertion tự thử lại trên locator (toBeVisible, toHaveText, toHaveURL, toHaveCount, …); không lấy kiểu kiểm tra thủ công expect(await …isVisible()) làm bằng chứng chính.',
  },
  {
    key: 'R4',
    name: 'Không chờ cố định, không force, không click theo toạ độ',
    solid:
      'Không có waitForTimeout hay sleep, không có force: true, không có mouse.click(x, y); việc chờ được giao cho locator và assertion.',
  },
  {
    key: 'R5',
    name: 'Cô lập và lặp lại được',
    solid:
      'Bài test chạy xanh khi chạy một mình và khi chạy cả bộ; phần chuẩn bị nằm trong beforeEach, test.use hoặc storageState; không dùng describe.serial và không có state dùng chung ở cấp module.',
  },
  {
    key: 'R6',
    name: 'Bằng chứng một lần chạy Chromium xanh',
    solid:
      'Đầu ra reporter dán vào cho thấy một bài test thật đã qua với expectedStatus: passed trong project Chromium (hoặc project mặc định) và 0 lỗi.',
  },
  {
    key: 'R7',
    name: 'Bạn giải thích được lựa chọn của mình',
    solid:
      'Phần giải thích nói rõ vì sao chọn các locator đó, vì sao không chờ thủ công, và bài test cô lập ra sao — bằng lời của chính bạn và khớp với mã đã nộp.',
  },
];

const L1 = `# Một bài kiểm thử end-to-end đáng tin thật sự là gì

## Mục tiêu

- Phân biệt bài test kiểm tra **hành vi người dùng thấy được** với bài test kiểm tra chi tiết nội bộ.
- Chọn đúng **một** quy trình thật trong ứng dụng của bạn và nói được "chạy đúng" nghĩa là gì.
- Hiểu rằng Playwright vốn đã tự chờ, nên phần lớn sleep và retry chỉ là nhiễu.

## Giải thích

Một bài test end-to-end điều khiển ứng dụng như một người thật: mở trang, bấm, gõ, gửi, rồi nhìn
vào đúng thứ người đó sẽ nhìn. Vì vậy tiêu chí "đáng tin" không phải là "chạy được trên máy tôi
hôm nay", mà là "người khác chạy lại cũng ra cùng một kết luận".

Bài test đáng tin có ba tính chất:

- **Bám vào hành vi**: nó nói về việc người dùng làm được gì, không nói về tên class, tên state
  hay cấu trúc component.
- **Có một mục tiêu rõ**: một quy trình, một câu khẳng định "đã xong". Bài test phủ mười thứ cùng
  lúc sẽ đỏ vì mười lý do khác nhau và không ai biết bắt đầu từ đâu.
- **Không tự lừa mình**: không có chờ cố định, không bỏ qua kiểm tra, không "chạy lại cho xanh".

## Ví dụ minh hoạ

Một người viết bài test cho trang bán hàng. Bản đầu kiểm tra rằng sau khi bấm nút, phần tử có class
"cart-badge" tồn tại và có nội dung "1". Ba tháng sau, đội thiết kế đổi badge thành một component
khác — hành vi người dùng không đổi, nhưng bài test đỏ. Bản thứ hai kiểm tra rằng sau khi bấm "Thêm
vào giỏ", người dùng **thấy** dòng sản phẩm trong giỏ với số lượng 1. Cùng một ứng dụng, nhưng bản
thứ hai chỉ đỏ khi người dùng thật sự bị ảnh hưởng.

## Hiểu nhầm thường gặp

- **Hiểu nhầm:** "Test càng nhiều bước càng tốt." **Thực tế:** bài test càng dài càng khó biết lỗi
  nằm ở đâu; hãy phủ sâu một quy trình.
- **Hiểu nhầm:** "Phải kiểm tra DOM thì mới chắc." **Thực tế:** DOM là chi tiết triển khai; thứ cần
  chắc là điều người dùng thấy.
- **Hiểu nhầm:** "Test chập chờn thì thêm retry." **Thực tế:** retry che đi nguyên nhân; hãy tìm
  chỗ chờ sai.

## Kiểm tra hiểu biết

1. Quy trình bạn chọn có phải là việc một người dùng thật sự làm, hay chỉ là việc bạn muốn kiểm tra?
2. Nếu ngày mai ai đó đổi giao diện mà hành vi không đổi, bài test của bạn có đỏ không? Vì sao?
3. Câu "chạy đúng" của bạn có viết được thành một câu mà người khác đọc là hiểu không?

## Bài tập

Chọn **một** quy trình trong ứng dụng của bạn — ví dụ: đăng nhập, thêm một mục, gửi một biểu mẫu.
Viết nó thành các bước bằng lời người dùng (mở gì, gõ gì, bấm gì, thấy gì). Sau đó viết đúng **một
câu** nói lên điều chứng minh quy trình đã xong.

**Tiêu chí thành công:** một người không biết mã của bạn đọc các bước và câu khẳng định đó vẫn hiểu
"đã xong" nghĩa là gì, và không có bước nào nhắc tới class, id nội bộ hay tên state.

## Điểm chính cần nhớ

- End-to-end nghĩa là đi từ góc nhìn người dùng, không phải từ góc nhìn DOM.
- Một quy trình thật, một câu khẳng định rõ, một bài test dễ đọc.
- Playwright đã tự chờ; nhiệm vụ của bạn là mô tả đúng điều cần chờ.

## Tài nguyên tham khảo

- Triết lý kiểm thử — https://playwright.dev/docs/best-practices
- Giới thiệu Playwright Test — https://playwright.dev/docs/intro`;

const L2 = `# Tìm phần tử theo cách người dùng làm

## Mục tiêu

- Biết thứ tự ưu tiên locator: role, label, text, test id, rồi mới tới CSS/XPath.
- Hiểu vì sao locator ngữ nghĩa sống sót qua những lần đổi giao diện.
- Dùng codegen để **khám phá**, không phải để dán nguyên vào dự án.

## Giải thích

Người dùng không tìm phần tử bằng \`div > div:nth-child(3)\`. Họ tìm bằng những gì họ thấy: một nút
tên "Đăng nhập", một ô có nhãn "Email", một dòng chữ "Đơn hàng của bạn". Locator ngữ nghĩa mô tả
đúng những thứ đó, nên khi giao diện đổi cách trình bày, locator vẫn đúng.

Thứ tự ưu tiên thực dụng:

1. **Role** — nút, liên kết, ô nhập, tiêu đề. Đây là thứ công nghệ hỗ trợ (trình đọc màn hình)
   cũng dùng, nên nó vừa bền vừa đúng nghĩa.
2. **Label** — nhãn hiển thị của ô nhập, đúng như người dùng đọc.
3. **Text** — nội dung người dùng nhìn thấy.
4. **Test id** — khi không còn cách nào diễn đạt bằng ngôn ngữ người dùng; đây là hợp đồng bạn chủ
   động đặt ra với ứng dụng.
5. **CSS/XPath** — phương án cuối, vì chúng bám vào cấu trúc DOM, thứ thay đổi thường xuyên nhất.

Locator của Playwright là **strict**: nếu một locator khớp nhiều phần tử, thao tác sẽ báo lỗi thay vì
âm thầm chọn phần tử đầu tiên. Đó là đặc điểm tốt — nó buộc bạn nói rõ ý mình, bằng cách nối tiếp
hoặc lọc theo phạm vi.

## Ví dụ minh hoạ

Một biểu mẫu đăng nhập có hai ô nhập và một nút. Cách viết bám vào cấu trúc sẽ là "ô nhập thứ nhất,
ô nhập thứ hai, nút thứ ba". Cách viết theo người dùng là "ô có nhãn Email, ô có nhãn Mật khẩu, nút
có tên Đăng nhập". Lần sau ai đó thêm một ô "Mã dự phòng" lên đầu biểu mẫu, cách thứ nhất đỏ ngay,
cách thứ hai vẫn đúng — vì nó không đếm, nó gọi tên.

## Hiểu nhầm thường gặp

- **Hiểu nhầm:** "Test id là xấu." **Thực tế:** test id là hợp đồng rõ ràng và ổn định; chỉ nên dùng
  khi ngữ nghĩa không diễn đạt được.
- **Hiểu nhầm:** "Cứ lấy locator đầu tiên khớp là được." **Thực tế:** strict mode sẽ báo lỗi; hãy
  thu hẹp bằng phạm vi hoặc bộ lọc.
- **Hiểu nhầm:** "codegen sinh ra là dùng được luôn." **Thực tế:** codegen ghi lại *thao tác*, không
  ghi lại *ý định*; hãy đọc rồi viết lại.

## Kiểm tra hiểu biết

1. Locator nào trong bài test hiện tại của bạn sẽ đỏ nếu ai đó đổi tên class?
2. Bạn có locator nào khớp nhiều phần tử mà vẫn "tình cờ" chạy được không?
3. Nếu phải giải thích locator của mình cho một người không đọc mã, bạn nói thế nào?

## Bài tập

Viết ra **năm** locator cho quy trình bạn chọn ở bài trước. Với mỗi locator, ghi một câu: nó bám vào
thứ gì (role, label, text, test id) và vì sao nó vẫn đúng nếu giao diện được làm lại.

**Tiêu chí thành công:** không locator nào dựa vào thứ tự phần tử, \`nth-child\`, chuỗi CSS nhiều tầng
hay XPath; và mỗi locator đọc lên vẫn đúng ý người dùng.

## Điểm chính cần nhớ

- Gọi tên phần tử như người dùng gọi, đừng đếm vị trí của nó.
- Strict mode là bạn, không phải kẻ thù.
- codegen để khám phá; ý định là do bạn viết.

## Tài nguyên tham khảo

- Locator — https://playwright.dev/docs/locators
- Thực hành tốt nhất — https://playwright.dev/docs/best-practices
- codegen — https://playwright.dev/docs/codegen`;

const L3 = `# Để Playwright chờ thay bạn

## Mục tiêu

- Hiểu assertion web-first tự thử lại cho tới khi đúng hoặc hết thời gian chờ.
- Phân biệt assertion web-first với kiểu kiểm tra thủ công không tự thử lại.
- Nhận ra waitForTimeout, force và click theo toạ độ là những cái bẫy.

## Giải thích

Khi bạn khẳng định một điều về locator, Playwright không kiểm tra một lần rồi kết luận. Nó **thử
lại** cho tới khi điều đó đúng, hoặc cho tới khi hết thời gian chờ của assertion (mặc định khoảng
năm giây). Đó là lý do bạn gần như không bao giờ cần tự chờ.

Ngược lại, kiểu kiểm tra thủ công — lấy trạng thái ra rồi so sánh — chỉ chạy **một lần**. Nếu trang
chưa kịp cập nhật, nó sai ngay, và người ta có xu hướng "sửa" bằng cách thêm một khoảng chờ cố
định. Khoảng chờ đó không sửa được gì: máy nhanh thì chờ thừa, máy chậm thì vẫn sai.

Ba cái bẫy thường gặp:

- **Chờ cố định**: dừng hẳn một số giây. Chỉ nên dùng khi gỡ lỗi, không bao giờ để lại trong bài test.
- **Bỏ qua kiểm tra (force)**: bảo Playwright bấm dù phần tử chưa sẵn sàng. Nó làm test xanh trong
  khi người dùng thật vẫn không bấm được.
- **Click theo toạ độ**: bấm vào điểm (x, y). Nó phụ thuộc kích thước cửa sổ và bố cục, nên đỏ ngay
  khi màn hình khác đi.

## Ví dụ minh hoạ

Một nút "Lưu" hiện thông báo sau khi gọi xong máy chủ. Cách viết thủ công: đọc xem thông báo có hiện
chưa, nếu chưa thì chờ nửa giây rồi đọc lại — bài test đỏ trên máy CI chậm. Cách viết web-first:
khẳng định rằng thông báo có nội dung "Đã lưu" **sẽ hiện ra**; Playwright tự chờ, tự thử lại, và
đỏ chỉ khi thông báo thật sự không bao giờ hiện. Cùng một hành vi, nhưng cách thứ hai chỉ đỏ khi ứng
dụng sai.

## Hiểu nhầm thường gặp

- **Hiểu nhầm:** "Thêm chờ cho chắc." **Thực tế:** chờ cố định làm test chậm và vẫn chập chờn.
- **Hiểu nhầm:** "Assertion tự chờ nghĩa là không cần nghĩ tới thời gian." **Thực tế:** vẫn có
  ngưỡng; nếu một thao tác thật sự mất lâu, hãy nói rõ ngưỡng đó thay vì chờ mò.
- **Hiểu nhầm:** "force chỉ là một tuỳ chọn cho tiện." **Thực tế:** nó bỏ qua chính thứ mà người
  dùng phụ thuộc vào.

## Kiểm tra hiểu biết

1. Chỗ nào trong bài test của bạn đang dùng trạng thái tức thời thay vì khẳng định?
2. Nếu bỏ mọi khoảng chờ cố định, chỗ nào đỏ đầu tiên — và vì sao?
3. Vì sao click theo toạ độ lại đỏ khi cửa sổ đổi kích thước?

## Bài tập

Tìm **một** chỗ trong bài test của bạn mà bạn từng muốn thêm chờ. Thay nó bằng một khẳng định
web-first đúng với điều người dùng cần thấy.

**Tiêu chí thành công:** bài test không còn khoảng chờ cố định nào; chỗ vừa sửa vẫn đỏ khi bạn cố
tình làm hỏng hành vi (ví dụ đổi nội dung thông báo) và xanh khi hành vi đúng.

## Điểm chính cần nhớ

- Khẳng định điều sẽ đúng, đừng kiểm tra điều đang đúng.
- Assertion tự thử lại; khoảng chờ cố định thì không.
- force và toạ độ che lỗi thật.

## Tài nguyên tham khảo

- Assertion web-first — https://playwright.dev/docs/best-practices
- Thời gian chờ — https://playwright.dev/docs/test-timeouts
- Tự động chờ — https://playwright.dev/docs/actionability`;

const L4 = `# Chạy được hai lần, và chạy một mình

## Mục tiêu

- Hiểu mỗi bài test nhận một ngữ cảnh trình duyệt mới, sạch.
- Đưa phần chuẩn bị vào beforeEach, test.use hoặc trạng thái đăng nhập đã lưu.
- Nhận ra vì sao chạy tuần tự và state dùng chung ở cấp module lại che lỗi.

## Giải thích

Playwright tạo cho **mỗi bài test** một ngữ cảnh trình duyệt riêng: cookie, bộ nhớ cục bộ và phiên
đăng nhập đều mới. Đó là món quà lớn nhất mà framework dành cho bạn — nghĩa là một bài test không
nên phụ thuộc vào việc bài trước đã làm gì.

Ba công cụ để giữ tính cô lập:

- **beforeEach**: chạy phần chuẩn bị trước mỗi bài test — đăng nhập, tạo dữ liệu, mở đúng trang.
- **test.use**: khai báo cấu hình cho một nhóm bài test (kích thước cửa sổ, quyền, trạng thái).
- **Trạng thái đăng nhập đã lưu**: đăng nhập một lần, lưu lại, và tái sử dụng cho nhiều bài test
  thay vì đăng nhập lại qua giao diện ở mọi bài.

Ngược lại, chạy tuần tự và biến dùng chung ở cấp module tạo ra **phụ thuộc ẩn**: bài test chỉ xanh
khi chạy đúng thứ tự, đúng một mình, hoặc đúng trên máy của người viết. Những bài như thế thường
xanh trong nhiều tuần rồi đỏ vào đúng ngày quan trọng.

## Ví dụ minh hoạ

Một nhóm ba bài test dùng chung một biến đếm được khởi tạo ở đầu file. Chạy cả bộ thì xanh; chạy
riêng bài thứ ba thì đỏ, vì biến chưa được khởi tạo. Người viết "sửa" bằng cách chạy tuần tự — và
từ đó bài test không còn nói gì về ứng dụng nữa, chỉ nói về thứ tự. Chuyển phần khởi tạo vào
beforeEach, cả ba bài chạy độc lập được, và bài thứ ba đỏ ngay nếu ứng dụng thật sự hỏng.

## Hiểu nhầm thường gặp

- **Hiểu nhầm:** "Chạy tuần tự cho nhanh." **Thực tế:** nó nhanh hơn để viết, chậm hơn để gỡ.
- **Hiểu nhầm:** "Đăng nhập lại ở mọi bài là lãng phí." **Thực tế:** đó chính là thứ làm bài test
  độc lập; nếu quá chậm, hãy lưu trạng thái đăng nhập.
- **Hiểu nhầm:** "Test xanh là xong." **Thực tế:** hãy chạy nó một mình, hai lần liên tiếp, và theo
  thứ tự đảo ngược.

## Kiểm tra hiểu biết

1. Bài test của bạn có xanh khi chạy một mình không?
2. Có biến nào ở cấp module mà hai bài test cùng đọc hoặc ghi không?
3. Nếu chạy lại lần hai mà đỏ, bạn nghĩ dữ liệu nào còn sót lại từ lần trước?

## Bài tập

Chạy bài test của bạn theo ba cách: một mình, hai lần liên tiếp, và cùng cả bộ nhưng đảo thứ tự.
Không sửa mã giữa các lần chạy.

**Tiêu chí thành công:** cả ba lần đều xanh, và bạn chỉ ra được phần chuẩn bị nào đang giữ cho bài
test độc lập (beforeEach, test.use hay trạng thái đăng nhập đã lưu).

## Điểm chính cần nhớ

- Mỗi bài test có một ngữ cảnh sạch; đừng dựa vào bài trước.
- Chuẩn bị thuộc về beforeEach, không thuộc về "lần chạy trước".
- Chạy tuần tự chỉ giấu đi vấn đề cô lập.

## Tài nguyên tham khảo

- Cô lập — https://playwright.dev/docs/browser-contexts
- beforeEach và fixtures — https://playwright.dev/docs/test-fixtures
- Trạng thái đăng nhập — https://playwright.dev/docs/auth`;

const L5 = `# Chứng minh: project, reporter, bằng chứng

## Mục tiêu

- Hiểu project nghĩa là gì và vì sao nên chạy đúng một trình duyệt cho bằng chứng.
- Đọc được bản tóm tắt của reporter và biết số nào là số thật.
- Chuẩn bị bằng chứng của riêng bạn để đưa vào bài đánh giá.

## Giải thích

Playwright chạy bài test theo **project**. Một project là một cấu hình: trình duyệt nào, kích thước
cửa sổ nào, có chạy lại khi lỗi hay không. Nếu bạn không khai báo gì, Playwright dùng một project
mặc định với Chromium. Khi cần bằng chứng rõ ràng, hãy chọn đúng project Chromium bằng tham số
dòng lệnh (tên tham số là \`--project=chromium\`) để báo cáo ghi rõ trình duyệt.

Reporter là phần in ra kết quả. Có hai kiểu hữu ích cho bằng chứng:

- **Reporter JSON**: đầu ra máy đọc được — có cấu hình, danh sách file, từng bài test, từng lần
  chạy lại, và một khối thống kê. Bật bằng \`--reporter=json\`.
- **Reporter dạng danh sách**: dòng chữ dễ đọc trong terminal, kèm phần tóm tắt ở cuối. Bật bằng
  \`--reporter=list\`.

Trong đầu ra JSON có hai trường rất dễ đọc sai. \`stats\` đếm theo *kết cục* của bài test, không phải
theo việc nó có thật sự qua hay không — một bài được đánh dấu "kỳ vọng thất bại" vẫn vào nhóm đó dù
không có lần chạy xanh nào. Vì vậy, bằng chứng của một lần chạy xanh phải là: bài test có trạng thái
kết cục là bình thường, trạng thái kỳ vọng là "passed", và có ít nhất một lần chạy thật sự qua.

Trong bản tóm tắt dạng chữ, hãy đọc đúng dòng: "1 flaky" nghĩa là bài test đỏ ở lần đầu và xanh khi
chạy lại; "1 skipped" nghĩa là bài test bị bỏ qua, không phải đã qua.

## Ví dụ minh hoạ

Hai người cùng nộp bằng chứng. Người thứ nhất dán một ảnh chụp màn hình có chữ "passed". Người thứ
hai dán đầu ra JSON của một lần chạy Chromium: ba bài test, hai qua, một bị bỏ qua, không có lỗi.
Người thứ hai chứng minh được nhiều hơn hẳn — vì dữ liệu cho biết chính xác cái gì đã chạy và cái gì
không.

## Hiểu nhầm thường gặp

- **Hiểu nhầm:** "Cứ chạy hết mọi trình duyệt." **Thực tế:** một lần chạy Chromium sạch là đủ cho
  tiêu chí này; chạy thêm trình duyệt chỉ thêm lỗi không liên quan.
- **Hiểu nhầm:** "0 lỗi nghĩa là mọi bài đều qua." **Thực tế:** bài bị bỏ qua cũng không tính là qua.
- **Hiểu nhầm:** "Dán trace hay ảnh cho trực quan." **Thực tế:** chúng có thể chứa dữ liệu riêng;
  bằng chứng cần là văn bản của reporter.

## Kiểm tra hiểu biết

1. Báo cáo của bạn có ghi rõ project nào đã chạy không?
2. Có bài test nào bị bỏ qua mà bạn vẫn tính là đã qua không?
3. Nếu có một bài flaky, bạn giải thích được vì sao nó flaky chưa?

## Bài tập

Chạy bài test của bạn ba lần với project Chromium. Lưu lại đầu ra của reporter (JSON hoặc danh sách)
của lần chạy sạch nhất, và ghi lại một câu về điều bất thường nếu có.

**Tiêu chí thành công:** bạn có một tệp bằng chứng cho thấy ít nhất một bài test thật sự qua trong
project Chromium, 0 lỗi, và bạn đọc được đúng các con số trong đó mà không cần đoán.

## Điểm chính cần nhớ

- Project là cấu hình; hãy chọn đúng project cho bằng chứng.
- Reporter JSON là dữ liệu; reporter danh sách là bản tóm tắt.
- "Kỳ vọng" không phải "đã qua"; hãy đọc trạng thái thật.

## Tài nguyên tham khảo

- Reporter — https://playwright.dev/docs/test-reporters
- Dòng lệnh — https://playwright.dev/docs/test-cli
- Project — https://playwright.dev/docs/test-projects`;

export const PLAYWRIGHT_TEMPLATE_VI = {
  title: 'Viết bài kiểm thử E2E Playwright đáng tin đầu tiên cho một quy trình web thật',
  description:
    'Khoá học năm bài để bạn tự viết một file spec trong chính dự án của mình cho một quy trình người dùng thật, và tự chạy nó trên Chromium tới khi xanh.',
  level: 'Intermediate',
  kind: 'programming',
  goal:
    'Tự viết và tự chạy một bài kiểm thử E2E Playwright đáng tin cho một quy trình thật trong ứng dụng của bạn.',
  topics: ['playwright', 'kiểm thử e2e', 'tự động hoá kiểm thử'],
  language: 'vi',
  artifact: ARTIFACT_VI,
  preflight: [
    {
      id: 'own_app',
      label:
        'Tôi có một ứng dụng web chạy được trên máy (hoặc một URL đã deploy) với ít nhất một quy trình thật.',
    },
    { id: 'node', label: 'Node đã cài — chạy `node -v` và thấy một số phiên bản.' },
    {
      id: 'playwright',
      label: 'Playwright đã cài và chạy được — `npx playwright --version` in ra một phiên bản.',
    },
    { id: 'chromium', label: 'Trình duyệt Chromium đã cài — `npx playwright install chromium`.' },
    {
      id: 'no_execution',
      label:
        'Tôi hiểu Studio không bao giờ chạy Playwright: tôi tự chạy trong terminal của mình và dán kết quả lại.',
    },
  ],
  capstone: {
    kind: 'programming',
    brief_md: BRIEF_VI,
    rubric: RUBRIC_VI,
    artifact: ARTIFACT_VI,
    tests: null,
    hiddenAnswers: null,
    externalId: 'template:playwright-e2e',
  },
  lessons: [
    {
      title: 'Một bài kiểm thử end-to-end đáng tin thật sự là gì',
      summary: 'Hành vi người dùng thấy được, một quy trình thật, một câu khẳng định rõ ràng.',
      content_md: L1,
      quiz_seed: [
        {
          question: 'Một bài kiểm thử end-to-end đáng tin kiểm tra điều gì?',
          options: [
            'Tên các class CSS trong DOM',
            'Hành vi mà người dùng có thể thấy',
            'Số dòng mã của component',
            'Cấu hình build của dự án',
          ],
          answerIndex: 1,
          explanation: 'End-to-end đi từ góc nhìn người dùng, nên hành vi thấy được mới là đối tượng.',
        },
        {
          question: '"Chạy xanh trên máy tôi" khác "đáng tin" ở chỗ nào?',
          options: [
            'Không khác gì cả',
            'Đáng tin nghĩa là người khác chạy lại cũng ra cùng kết luận',
            'Đáng tin chỉ là chạy nhanh hơn',
            'Đáng tin là không cần khẳng định gì',
          ],
          answerIndex: 1,
          explanation: 'Tính lặp lại trên máy khác mới là thước đo của đáng tin.',
        },
        {
          question: 'Một bài test nên phủ bao nhiêu quy trình?',
          options: ['Càng nhiều càng tốt', 'Đúng một quy trình thật, phủ sâu', 'Ba quy trình bất kỳ', 'Toàn bộ ứng dụng'],
          answerIndex: 1,
          explanation: 'Một quy trình giữ cho nguyên nhân lỗi rõ ràng khi bài test đỏ.',
        },
        {
          question: 'Vì sao thêm khoảng chờ cố định không làm bài test đáng tin hơn?',
          options: [
            'Vì khoảng chờ quá ngắn',
            'Vì nó che mất việc Playwright đã tự chờ, chỉ làm test chậm và dễ chập chờn',
            'Vì khoảng chờ chỉ chạy trên Windows',
            'Vì khoảng chờ cần cài thêm gói',
          ],
          answerIndex: 1,
          explanation: 'Chờ mò không sửa được nguyên nhân, chỉ đổi lỗi thành lỗi lúc khác.',
        },
        {
          question: '"Chạy đúng" nên được viết ra khi nào?',
          options: [
            'Không cần viết, tự hiểu',
            'Thành một câu mô tả điều người dùng thấy, trước khi viết mã',
            'Trong commit message',
            'Trong file cấu hình',
          ],
          answerIndex: 1,
          explanation: 'Câu khẳng định viết trước giúp bài test bám vào ý định, không bám vào mã.',
        },
      ],
    },
    {
      title: 'Tìm phần tử theo cách người dùng làm',
      summary: 'role, label, text, test id — và vì sao CSS/XPath là phương án cuối.',
      content_md: L2,
      quiz_seed: [
        {
          question: 'Thứ tự ưu tiên locator theo tài liệu Playwright là gì?',
          options: [
            'CSS → XPath → role',
            'role → label → text hoặc test id → CSS/XPath',
            'XPath → CSS → test id',
            'id → class → tag',
          ],
          answerIndex: 1,
          explanation: 'Ngữ nghĩa trước, cấu trúc DOM sau.',
        },
        {
          question: 'Vì sao ưu tiên locator theo role?',
          options: [
            'Vì nó chạy nhanh nhất',
            'Vì nó bám vào thứ người dùng (và công nghệ hỗ trợ) cũng thấy',
            'Vì nó ngắn nhất',
            'Vì CSS không chạy trên Chromium',
          ],
          answerIndex: 1,
          explanation: 'Role là ngữ nghĩa của phần tử, không phải cách nó được trình bày.',
        },
        {
          question: 'Locator ở chế độ strict nghĩa là gì?',
          options: [
            'Chỉ chấp nhận đúng một phần tử khớp, nhiều hơn thì báo lỗi',
            'Luôn chọn phần tử đầu tiên',
            'Không cần chờ',
            'Chỉ chạy ở chế độ có giao diện',
          ],
          answerIndex: 0,
          explanation: 'Strict buộc bạn nói rõ ý, thay vì âm thầm chọn sai phần tử.',
        },
        {
          question: 'Nên dùng codegen thế nào?',
          options: [
            'Dán nguyên si vào dự án',
            'Dùng để khám phá locator rồi viết lại theo ý định người dùng',
            'Thay cho việc đọc tài liệu',
            'Chỉ để chụp ảnh giao diện',
          ],
          answerIndex: 1,
          explanation: 'codegen ghi lại thao tác; ý định và tên gọi là do bạn viết.',
        },
        {
          question: 'Khi DOM đổi tên class, locator nào còn sống?',
          options: [
            'Chuỗi CSS nhiều tầng',
            'nth-child theo vị trí',
            'Locator theo nhãn mà người dùng đọc',
            'Bộ chọn tag lồng nhau',
          ],
          answerIndex: 2,
          explanation: 'Nhãn người dùng thấy không đổi khi class đổi.',
        },
      ],
    },
    {
      title: 'Để Playwright chờ thay bạn',
      summary: 'Assertion web-first tự thử lại; chờ cố định, force và toạ độ là bẫy.',
      content_md: L3,
      quiz_seed: [
        {
          question: 'Assertion web-first khác kiểm tra thủ công ở đâu?',
          options: [
            'Không khác',
            'Nó tự thử lại cho tới khi đúng hoặc hết thời gian chờ',
            'Nó luôn chạy nhanh hơn',
            'Nó không cần locator',
          ],
          answerIndex: 1,
          explanation: 'Tự thử lại là điều làm nó ổn định trên máy chậm.',
        },
        {
          question: 'Cách viết nào là web-first?',
          options: [
            'Đọc trạng thái hiển thị rồi so sánh với true',
            'Khẳng định rằng locator sẽ hiển thị, để Playwright tự chờ',
            'Gọi kiểm tra hiển thị một lần',
            'Dừng hẳn nửa giây rồi kiểm tra',
          ],
          answerIndex: 1,
          explanation: 'Khẳng định trên locator được Playwright thử lại tự động.',
        },
        {
          question: 'waitForTimeout phù hợp trong trường hợp nào?',
          options: ['Trong mọi bài test', 'Chỉ khi gỡ lỗi tạm thời', 'Khi CI chậm', 'Khi test chập chờn'],
          answerIndex: 1,
          explanation: 'Tài liệu xếp nó vào nhóm chỉ dùng để gỡ lỗi.',
        },
        {
          question: 'force: true làm gì?',
          options: [
            'Chờ phần tử hiện ra',
            'Bỏ qua các kiểm tra về khả năng thao tác trên phần tử',
            'Tăng thời gian chờ',
            'Chạy lại bài test',
          ],
          answerIndex: 1,
          explanation: 'Bỏ qua kiểm tra nghĩa là bấm dù người dùng thật chưa bấm được.',
        },
        {
          question: 'Thời gian chờ mặc định của một assertion là khoảng bao lâu?',
          options: ['500 ms', '5 giây', '30 giây', '5 phút'],
          answerIndex: 1,
          explanation: 'Mặc định khoảng năm giây, trong khi thời gian chờ của cả bài test là ba mươi giây.',
        },
      ],
    },
    {
      title: 'Chạy được hai lần, và chạy một mình',
      summary: 'Mỗi bài test một ngữ cảnh sạch; chuẩn bị nằm ở beforeEach.',
      content_md: L4,
      quiz_seed: [
        {
          question: 'Mỗi bài test Playwright nhận được gì?',
          options: [
            'Một ngữ cảnh trình duyệt mới, sạch',
            'Cùng một trang dùng chung với bài trước',
            'Một trình duyệt dùng chung mãi mãi',
            'Không có gì',
          ],
          answerIndex: 0,
          explanation: 'Ngữ cảnh riêng cho mỗi bài test là nền tảng của tính cô lập.',
        },
        {
          question: 'beforeEach dùng để làm gì?',
          options: [
            'Chụp ảnh màn hình',
            'Chuẩn bị trạng thái chung (ví dụ đăng nhập) trước mỗi bài test',
            'Tắt trình duyệt',
            'Đếm số bài test',
          ],
          answerIndex: 1,
          explanation: 'Phần chuẩn bị thuộc về beforeEach, không thuộc về bài trước.',
        },
        {
          question: 'Trạng thái đăng nhập đã lưu giúp gì?',
          options: [
            'Lưu ảnh chụp',
            'Tái sử dụng phiên đăng nhập đã lưu cho nhiều bài test',
            'Nén mã nguồn',
            'Đổi project',
          ],
          answerIndex: 1,
          explanation: 'Đăng nhập một lần, dùng lại — vẫn giữ được tính độc lập.',
        },
        {
          question: 'Vì sao chế độ chạy tuần tự được khuyến cáo không nên dùng?',
          options: [
            'Vì nó chậm',
            'Vì nó làm bài test phụ thuộc thứ tự và che mất lỗi cô lập',
            'Vì nó không hỗ trợ TypeScript',
            'Vì nó cần cài thêm gói',
          ],
          answerIndex: 1,
          explanation: 'Phụ thuộc thứ tự khiến kết quả nói về thứ tự, không nói về ứng dụng.',
        },
        {
          question: 'Dấu hiệu rõ nhất của một bài test chưa cô lập là gì?',
          options: [
            'Chạy một mình thì xanh, chạy cả bộ thì đỏ',
            'Chạy quá nhanh',
            'Có nhiều khẳng định',
            'Dùng locator theo role',
          ],
          answerIndex: 0,
          explanation: 'Kết quả phụ thuộc vào bài khác là dấu hiệu của state dùng chung.',
        },
      ],
    },
    {
      title: 'Chứng minh: project, reporter, bằng chứng',
      summary: 'Chọn project Chromium, đọc reporter, và chuẩn bị bằng chứng của riêng bạn.',
      content_md: L5,
      quiz_seed: [
        {
          question: 'Tham số chọn project dùng để làm gì?',
          options: [
            'Đổi thư mục làm việc',
            'Chọn đúng project (trình duyệt) cần chạy',
            'Tắt reporter',
            'Bật chế độ có giao diện',
          ],
          answerIndex: 1,
          explanation: 'Project là cấu hình trình duyệt; chọn đúng project làm bằng chứng rõ ràng.',
        },
        {
          question: 'Reporter JSON cho ra loại dữ liệu gì?',
          options: [
            'Chữ trang trí cho terminal',
            'Dữ liệu máy đọc được: cấu hình, file, từng bài test và thống kê',
            'Ảnh nén',
            'Cấu hình chạy song song',
          ],
          answerIndex: 1,
          explanation: 'JSON là định dạng máy đọc, phù hợp làm bằng chứng có thể kiểm chứng.',
        },
        {
          question: 'Trong đầu ra JSON, điều gì chứng minh một bài test thật sự đã qua?',
          options: [
            'Số đếm trong khối thống kê',
            'Kết cục bình thường, trạng thái kỳ vọng là passed, và có một lần chạy thật sự qua',
            'Trường ok của spec',
            'Phiên bản trong phần cấu hình',
          ],
          answerIndex: 1,
          explanation: 'Khối thống kê đếm theo kết cục, không phân biệt bài kỳ vọng thất bại.',
        },
        {
          question: 'Dòng "1 flaky" trong bản tóm tắt nghĩa là gì?',
          options: [
            'Bài test luôn đỏ',
            'Bài test đỏ ở lần đầu và xanh khi chạy lại',
            'Bài test bị bỏ qua',
            'Bài test chưa chạy',
          ],
          answerIndex: 1,
          explanation: 'Flaky là đỏ rồi xanh ở lần chạy lại — đáng chú ý nhưng không phải lỗi.',
        },
        {
          question: 'Bằng chứng nên nộp là gì?',
          options: [
            'Ảnh chụp màn hình ứng dụng',
            'Đầu ra reporter của một lần chạy Chromium với 0 lỗi',
            'File trace',
            'Video bài chạy',
          ],
          answerIndex: 1,
          explanation: 'Văn bản của reporter không chứa dữ liệu riêng và kiểm chứng được.',
        },
      ],
    },
  ],
};
