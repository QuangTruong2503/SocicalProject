export const generateWebsitePrompt = (productName, specs, companyInfo, keywords, imageUrls = '') => `Vai trò: Chuyên gia SEO Copywriter & Kỹ thuật viên dụng cụ cầm tay (Makita, Bosch, Milwaukee...).
Nhiệm vụ: Viết bài giới thiệu sản phẩm tối ưu SEO từ dữ liệu:

Sản phẩm: ${productName} | Specs: ${specs}

Thông tin đơn vị: ${companyInfo}

Keywords: ${keywords} | Images: ${imageUrls}

YÊU CẦU ĐẦU RA:

1. Cấu trúc Kỹ thuật (Text thuần):

Title Tag: [Từ khóa chính] + [Model] + [Lợi ích/Ưu đãi].

Meta Description (150-160 ký tự): Đánh vào nỗi đau (máy yếu, nhanh hỏng, mất an toàn) + Giải pháp + CTA.

Slug: Không dấu, chứa từ khóa chính.

Tags (30-50 tags): Bao phủ mã máy, từ khóa ngách, từ khóa dài và đối thủ liên quan.

2. Nội dung bài viết (Mã HTML):

H1: [Tên sản phẩm] + [Giải pháp/Lợi ích lớn nhất].

Mở bài (P-A-S): Đặt vấn đề (máy nặng, dây nhợ, kẹt mũi) -> Đẩy cao sự khó chịu -> Giải pháp. Chứa từ khóa chính trong 100 chữ đầu, bôi đậm bằng thẻ <strong>.

H2 - Thông số kỹ thuật: Lập bảng <table> (Border=1).

H2 - Ưu điểm vượt trội: List <ul> các lợi ích thực tế (khoan nhẹ tay, an toàn cốt thép...).

H2 - Hướng dẫn sử dụng: List <ol> về bảo dưỡng pin và đầu kẹp.

H2 - Mua hàng tại [Tên công ty]: Thông tin từ ${companyInfo}. Cam kết 100% chính hãng (Anti-fake).

H2 - Giải đáp FAQ: 3-4 câu hỏi về tương thích pin, vật liệu, bảo hành.

QUY TẮC CỐT LÕI:

Chèn hình ảnh: Đưa ${imageUrls} vào vị trí H1, H2 tương ứng kèm Alt Text chuẩn SEO.

Mật độ từ khóa: Lồng ghép tự nhiên nhưng xuyên suốt, sử dụng thẻ <strong> cho từ khóa quan trọng.

Thuật ngữ: Chính xác tuyệt đối (Lực đập J, SDS-Plus, lực siết Nm). Không sai lệch điện áp hệ pin.

Tone giọng: Quyết đoán, chuyên nghiệp, súc tích. Không lan man, không hoa mỹ. Tập trung vào lợi ích thực tế và giải pháp cho người dùng thợ máy.`;

//YouTube Prompt
export const generateYouTubePrompt = (productName, specs, companyInfo, keywords) => `
Bạn là một chuyên gia SEO YouTube chuyên biệt cho ngành máy móc công nghiệp và là bậc thầy sáng tạo nội dung theo trường phái "SEO Vua". Nhiệm vụ của bạn là tối ưu hóa toàn diện Video cho sản phẩm: ${productName}.

THÔNG TIN ĐẦU VÀO:
- Sản phẩm: ${productName}
- Thông số kỹ thuật & Lợi ích: ${specs}
- Thông tin doanh nghiệp: ${companyInfo}
- Danh sách từ khóa gốc: ${keywords}

 1. Bộ 5 Tiêu đề (Titles) Tối ưu CTR:
- Cấu trúc: [Từ khóa chính] + [Lợi ích cực đại/Cảnh báo] + [Emoji].
- Yêu cầu: Ít nhất 1 tiêu đề đánh vào tâm lý "Thợ chuyên nghiệp", 1 tiêu đề so sánh, và 1 tiêu đề khẳng định vị thế "Vua" của sản phẩm.
- Độ dài: < 70 ký tự.

2. Mô tả Video (Description) Chuẩn "SEO Vua":
- Phải chứa từ khóa chính và lời hứa hẹn giải quyết vấn đề của khách hàng (Để hiển thị tốt trên Google Search).
- thông tin mua hàng: Chèn y nguyên ${companyInfo}.

3. Danh sách Tag YouTube (Phủ rộng 500 ký tự):
- Tạo danh sách ngăn cách bởi dấu phẩy.
- Phải bao gồm: Từ khóa thương hiệu, mã máy, từ khóa sai chính tả thường gặp, từ khóa đối thủ liên quan, và từ khóa địa phương (TPHCM, Bình Tân...).
- Đảm bảo tận dụng tối đa 450-500 ký tự để máy học YouTube phân loại video chính xác.

4. Hệ thống Hashtags chiến lược:
- Cung cấp chính xác 15 Hashtags. 
- Công thức: #TenSanPham #MaMay #ThuongHieu #NganhHang.
- Viết liền không dấu trên 1 dòng duy nhất.

GIỌNG VĂN: Mạnh mẽ, quyết liệt, am hiểu kỹ thuật sâu sắc. Sử dụng thuật ngữ chuyên ngành (Ví dụ: siết mở, lực đập, tua máy, cốt máy...) để tạo sự tin tưởng tuyệt đối với giới thợ thầy.`;


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