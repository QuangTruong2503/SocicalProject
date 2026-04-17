import axios from 'axios';
const API_URL = 'https://api.openai.com/v1/chat/completions';

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
// Hàm cũ: Gọi text thông thường
export const callOpenAI = async (prompt) => {
  try {
    const response = await axios.post(
      API_URL,
      {
        model: 'gpt-5.4-nano',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    throw new Error('Không thể kết nối với OpenAI API. Vui lòng kiểm tra lại API Key.');
  }
};

// HÀM MỚI: Trích xuất text từ ảnh (Sử dụng GPT-4o Vision)
export const extractTextFromImage = async (base64Image) => {
  try {
    const response = await axios.post(
      API_URL,
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: 'Hãy trích xuất danh sách các từ khóa duyệt theo từng dòng, đầy đủ nội dung mà bạn nhìn thấy từ hình ảnh này. Chỉ trả về các từ khóa, ngăn cách nhau bằng dấu phẩy. TUYỆT ĐỐI không cần giải thích hay thêm văn bản nào khác.' 
              },
              { 
                type: 'image_url', 
                image_url: { url: base64Image } 
              }
            ]
          }
        ],
        max_tokens: 300,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error extracting text from image:', error);
    throw new Error('Không thể đọc ảnh. Vui lòng kiểm tra lại.');
  }
};