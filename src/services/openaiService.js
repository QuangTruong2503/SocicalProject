import axios from 'axios';

const API_URL = 'https://api.openai.com/v1/chat/completions';
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY; // Đảm bảo bạn đã đặt biến môi trường này trong .env

export const callOpenAI = async (prompt) => {
  try {
    const response = await axios.post(
      API_URL,
      {
        model: 'gpt-5.4-mini', // Bắt buộc dùng model mới nhất theo yêu cầu
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
    console.log('apiKey used:', API_KEY ? 'Provided' : 'Not Provided');
    throw new Error('Không thể kết nối với OpenAI API. Vui lòng kiểm tra lại API Key.');
  }
};