export const generateWebsitePrompt = (productName, specs, companyInfo) => `
Bạn là một chuyên gia Content SEO E-commerce thực thụ. Nhiệm vụ của bạn là viết một bài mô tả sản phẩm chuẩn SEO, văn phong chuyên nghiệp, mang tính tư vấn kỹ thuật cao dựa trên các thông tin đầu vào sau:
- Tên sản phẩm: ${productName}
- Thông số kỹ thuật: ${specs}
- Thông tin công ty: ${companyInfo}

Hãy trình bày bài viết tuân thủ TUYỆT ĐỐI theo cấu trúc và các tiêu đề (Heading) dưới đây:

1. TỐI ƯU SEO META (Dành cho quản trị viên):
- Tiêu đề trang (Meta Title): [Dưới 60 ký tự, chứa từ khóa chính]
- Mô tả trang (Meta Description): [Dưới 150 ký tự, tóm tắt điểm nổi bật, kích thích click]
- URL Slug: [Thân thiện với SEO, ví dụ: ten-san-pham-chinh-hang]
- Tags: [Liệt kê 5-7 từ khóa LSI ngăn cách bằng dấu phẩy]

--- NỘI DUNG BÀI VIẾT HIỂN THỊ TRÊN WEBSITE ---

[Tạo một Tiêu đề bài viết H1 gồm: Tên sản phẩm + 3 tính từ miêu tả đặc điểm nổi bật nhất, ví dụ: "Máy... - Nhỏ Gọn, Mạnh Mẽ, Hiệu Suất Vượt Trội"]

Giới Thiệu Chung
[Viết 2 đoạn văn tóm tắt: Sản phẩm là gì? Thuộc phân khúc/thương hiệu nào? Dành cho ai/ứng dụng vào công việc gì? Thiết kế và công suất nổi bật ra sao để thay thế các công cụ cũ?]

Thông Số Kỹ Thuật
[Trình bày lại các thông số kỹ thuật đầu vào dưới dạng danh sách rõ ràng, dễ đọc. Chuyển đổi các thông số thô thành dạng: "Tên thông số: Giá trị"]

Ưu Điểm Nổi Bật
[Dựa vào thông số, phân tích ra 4-5 ưu điểm thực tế. Trình bày theo dạng:
- Tên công nghệ/Tính năng: Mô tả chi tiết lợi ích mang lại cho người dùng (ví dụ cắt nhanh hơn, an toàn hơn, tiết kiệm sức lực...)]

Giá Bán Và Nơi Mua Chính Hãng
Quý khách có thể trải nghiệm và sở hữu ${productName} chính hãng tại:
${companyInfo}

Câu hỏi thường gặp (FAQ)
[Tạo ra 4 câu hỏi mà khách hàng thực tế sẽ thắc mắc nhất về sản phẩm này (ví dụ: thời lượng pin, cách bảo dưỡng/châm dầu, cách dùng tính năng đặc biệt, độ bền so với máy đời cũ). Đưa ra câu trả lời chi tiết, chuyên sâu mang tính tư vấn kỹ thuật.]`;

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
- Trích xuất toàn bộ từ khóa từ ${keywords}, cộng thêm các từ khóa đuôi dài (long-tail keywords) liên quan mật thiết đến ${productName} và ngành hàng.
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