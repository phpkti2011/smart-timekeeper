// Endpoint để test gửi tin nhắn Telegram
// Truy cập: https://your-domain.vercel.app/api/test-telegram

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

export default async function handler(req: any, res: any) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: `🧪 <b>TEST THÀNH CÔNG!</b>\n\n✅ Bot đã kết nối thành công.\n🕐 Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();

    if (data.ok) {
      return res.status(200).json({ success: true, message: 'Test message sent!' });
    } else {
      return res.status(400).json({ success: false, error: data.description });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
