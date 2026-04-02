export const generateWebsitePrompt = (productName, specs, companyInfo, keywords) => `
Bạn là một chuyên gia Content SEO E-commerce và Lập trình viên Front-end. Nhiệm vụ của bạn là viết bài mô tả sản phẩm chuẩn SEO kỹ thuật, trình bày hoàn toàn bằng mã HTML.

### THÔNG TIN ĐẦU VÀO:
- Tên sản phẩm: ${productName}
- Thông số kỹ thuật: ${specs}
- Thông tin công ty: ${companyInfo}
- Từ khóa mục tiêu: ${keywords}

### YÊU CẦU VỀ ĐỊNH DẠNG (BẮT BUỘC):
1. Phản hồi của bạn phải bao gồm 2 phần riêng biệt:
   - Phần 1: Metadata (Dạng text thuần để quản trị viên copy).
   - Phần 2: Nội dung hiển thị (Bọc toàn bộ trong mã HTML, bắt đầu bằng thẻ <div>).
2. Sử dụng Semantic HTML: H1 cho tiêu đề chính, H2 và H3 cho các tiêu đề phụ.
3. Tuyệt đối không sử dụng CSS inline (như style="..."), chỉ sử dụng các thẻ HTML chuẩn: <strong>, <em>, <ul>, <li>, <table>, <tr>, <td>.

### CẤU TRÚC CHI TIẾT:

1. TỐI ƯU SEO META (Dạng Text):
- Meta Title: [Chứa ${productName}, dưới 60 ký tự]
- Meta Description: [Chứa ${productName} + 1 tính năng nổi bật, dưới 150 ký tự]
- URL Slug: [Dạng không dấu: ten-san-pham-chinh-hang]
- Tags: [15 từ khóa LSI ngăn cách bằng dấu phẩy]

2. NỘI DUNG HTML (Bọc trong <div>):
- H1: [Tên sản phẩm + 3 đặc điểm nổi bật nhất]
- Giới thiệu: [2 đoạn văn <p> mô tả vị thế sản phẩm, giải quyết nỗi đau gì của khách hàng?]
- H2: Thông số kỹ thuật
  [Sử dụng cấu trúc <table> để liệt kê specs. Cột 1: Đặc tính, Cột 2: Thông số. Thêm class="product-specs-table" cho thẻ table]
- H2: Ưu điểm nổi bật của ${productName}
  [Triển khai 4-5 thẻ H3. Mỗi H3 là một tính năng. Dưới mỗi H3 là 1 đoạn văn <p> phân tích lợi ích kỹ thuật sâu sắc. Sử dụng <strong> để nhấn mạnh các thông số quan trọng.]
- H2: Giá bán và địa chỉ mua hàng chính hãng
  [Sử dụng <p> và <ul> để trình bày thông tin từ ${companyInfo}]
- H2: Câu hỏi thường gặp (FAQ)
  [Sử dụng cấu trúc: <strong>Câu hỏi: [Nội dung]</strong> kèm theo <p>Trả lời: [Nội dung chuyên sâu]</p>]

### QUY TẮC VIẾT CONTENT:
- Ngôn ngữ: Tiếng Việt, văn phong chuyên nghiệp, tin cậy.
- Mật độ từ khóa: Chèn ${productName} một cách tự nhiên vào các thẻ H2 và đoạn văn đầu tiên.
- Tránh các từ sáo rỗng (tốt nhất, tuyệt vời nhất), tập trung vào số liệu và hiệu quả thực tế từ ${specs}.
`;
export const generateYouTubePrompt = (productName, specs, companyInfo, keywords) => `
Đóng vai là một chuyên gia SEO YouTube và chuyên viên sáng tạo nội dung kỹ thuật. Hãy viết một bộ nội dung chuẩn SEO cho video YouTube review/giới thiệu sản phẩm dựa trên các dữ liệu đầu vào sau:

[DỮ LIỆU ĐẦU VÀO]
- Tên sản phẩm: ${productName}
- Thông số kỹ thuật nổi bật: ${specs}
- Bộ từ khóa SEO bắt buộc: ${keywords}
- Thông tin công ty/mua hàng: ${companyInfo}

[YÊU CẦU ĐẦU RA (Trình bày đúng 4 phần sau)]

1. Tiêu đề Video (YouTube Title):
- Đề xuất 5 lựa chọn tiêu đề giật tít, kích thích sự tò mò để tối ưu tỷ lệ click (CTR).
- Bắt buộc phải chứa từ khóa chính (ưu tiên đặt ở đầu câu).
- Khống chế độ dài dưới 70 ký tự để hiển thị tốt nhất trên điện thoại. Có thể dùng thêm 1-2 emoji phù hợp.

2. Mô tả Video (Video Description):
Gửi lời chào nhắm đúng vào tâm lý của khách hàng. Giới thiệu hấp dẫn về ${productName} và bắt buộc phải chứa từ khóa chính ngay trong 2-3 dòng đầu tiên.
Đừng chỉ liệt kê ${specs} một cách khô khan, hãy diễn giải các thông số này thành lợi ích thực tế cho người dùng. 
Lồng ghép khéo léo, mượt mà toàn bộ các từ khóa trong danh sách ${keywords} vào các đoạn văn. Tuyệt đối không nhồi nhét khiên cưỡng làm gãy gọn ngữ pháp. Chia thành các đoạn văn ngắn (3-4 dòng) để dễ đọc.
Kêu gọi người xem Like, Subscribe kênh và chèn y nguyên khối thông tin liên hệ dưới đây (không thay đổi bất kỳ chữ nào):

${companyInfo}

3. Danh sách Tag YouTube (Tags):
- Tối đa 500 ký tự.
- Trích xuất toàn bộ từ khóa từ ${keywords}, cộng thêm các từ khóa đuôi dài (long-tail keywords), từ khóa ngắn liên quan mật thiết đến ${productName} và ngành hàng.
- Định dạng: Trình bày thành một dải từ khóa, phân cách nhau bằng dấu phẩy (, ) để tôi có thể copy/paste trực tiếp vào YouTube (tổng cộng khoảng 400-500 ký tự).

4. Gợi ý Hashtags:
- Cung cấp 10 - 15 hashtag sát nhất với sản phẩm, từ khóa liên quan, đối tượng và thương hiệu. 
- Định dạng: Viết liền không dấu, bắt đầu bằng dấu # (Ví dụ: #TenSanPham #ThuongHieu). Đặt tất cả trên cùng một dòng.

Giọng văn yêu cầu: Chuyên nghiệp, am hiểu kỹ thuật cơ khí/máy móc nhưng phải thực dụng, dứt khoát. Nói đúng "ngôn ngữ" và thuật ngữ của dân kỹ thuật, thợ thầy.`;

export const generateFacebookPrompt = (productName, specs, companyInfo) => `
Bạn là một Copywriter chuyên nghiệp thực chiến trên Facebook, chuyên viết bài quảng cáo bán hàng mang lại tỷ lệ chuyển đổi cao.
Dựa vào các thông tin sau:
- Tên sản phẩm: ${productName}
- Thông số kỹ thuật: ${specs}

Hãy trình bày theo bố cục sau:

- Viết một câu mở đầu (viết hoa) gây ấn tượng cực mạnh, đánh trúng tâm lý, nhu cầu, hoặc giải quyết nỗi đau cốt lõi của người dùng (như thợ chuyên nghiệp, thợ cơ khí, người dùng gia đình...). Dùng 1-2 icon phù hợp để tăng hiệu ứng thị giác.


- Tuyệt đối không copy y nguyên thông số khô khan. Hãy "dịch" các thông số kỹ thuật đó thành LỢI ÍCH thực tế cho người dùng (ví dụ: công suất mạnh -> hoàn thiện công việc nhanh hơn, thiết kế gọn -> không mỏi tay khi làm lâu...).
- Trình bày ngắn gọn, dễ đọc, ngắt dòng hợp lý, có icon đầu dòng để làm nổi bật ý.


- Tạo sự khan hiếm hoặc thúc giục khách hàng hành động ngay (Inbox/Gọi điện để nhận tư vấn hoặc ưu đãi).
- Chèn đầy đủ và nguyên văn thông tin liên hệ sau ở cuối bài: ${companyInfo}.
`;

export const generateTiktokPrompt = (productName, specs) => `
Vai trò: Bạn là một chuyên gia Content Marketing và chuyên gia tối ưu SEO trên nền tảng TikTok.
Tên sản phẩm: ${productName}
Thông số kỹ thuật: ${specs}

Nhiệm vụ: Viết bài đăng TikTok cho sản phẩm dựa trên thông tin được cung cấp.

Yêu cầu cấu trúc bài viết:

Tiêu đề (Dòng đầu): Viết in hoa, chứa tên sản phẩm + 2 đặc điểm nổi bật nhất + Emoji phù hợp.

Mở đầu (Hook): Đặt một câu hỏi đánh vào nỗi đau hoặc nhu cầu thực tế của khách hàng.

Thân bài (Lợi ích): Sử dụng danh sách (bullet points) với các icon thu hút. Không chỉ liệt kê thông số, hãy chuyển thông số thành Lợi ích (Ví dụ: "Pin 18V" -> "Hoạt động mạnh mẽ, không lo dây dợ").

Lưu ý đặc biệt: Ghi rõ về phụ kiện đi kèm hoặc lưu ý sử dụng (nếu có).

Hashtag: Chèn 10-12 hashtag bao gồm: Tên thương hiệu, mã máy, dòng sản phẩm, từ khóa ngành và hashtag xu hướng TikTok.

Phong cách ngôn ngữ: Chuyên nghiệp, tin cậy nhưng vẫn gần gũi, sử dụng thuật ngữ ngành chính xác.

Thông tin sản phẩm để viết: > [Dán thông số kỹ thuật, tên máy và phụ kiện vào đây]
`