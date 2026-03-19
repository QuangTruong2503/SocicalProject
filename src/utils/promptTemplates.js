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

export const generateYouTubePrompt = (productName, specs, companyInfo) => `
Bạn là một chuyên gia phát triển kênh YouTube, đặc biệt am hiểu thuật toán của YouTube Shorts.
Dựa vào các thông tin sau:
- Tên sản phẩm: ${productName}
- Thông số kỹ thuật: ${specs}
- Thông tin công ty: ${companyInfo}

Hãy tạo phần siêu dữ liệu (metadata) để đăng video Shorts nhằm đạt độ viral cao và tối ưu công cụ tìm kiếm của YouTube. Tuyệt đối KHÔNG viết kịch bản video. Trình bày kết quả theo đúng định dạng sau:

1. TIÊU ĐỀ VIDEO (Title):
- Viết 1 tiêu đề thật giật tít, thu hút sự chú ý ngay lập tức, có chứa từ khóa chính. Phải ngắn gọn dưới 60 ký tự để không bị cắt chữ trên màn hình điện thoại.

2. MÔ TẢ VIDEO (Description):
- Viết 2-3 câu mô tả cực kỳ ngắn gọn, tập trung nêu bật điểm "ăn tiền" nhất hoặc sức mạnh đáng gờm nhất của sản phẩm từ thông số kỹ thuật.
- Thêm một câu kêu gọi hành động (CTA) yêu cầu người xem bình luận hoặc xem chi tiết tại link dưới phần bình luận.
- Liên hệ để được tư vấn: 
    + số điện thoại
    + website
- Cung cấp 5-7 Hashtags (#) thịnh hành và sát với ngách sản phẩm nhất.

3. THẺ TAGS:
- Tags: 
    Cung cấp 5-10 thẻ tags (từ khóa dài và ngắn) liên quan đến sản phẩm, định dạng ngăn cách bởi dấu ",".
`;

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