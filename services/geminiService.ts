import { AttendanceLog } from "../types";
import { format } from "date-fns";

export const generateAttendanceReport = async (logs: AttendanceLog[], userName: string): Promise<string> => {
  let apiKey: string | undefined;

  try {
    // Vite Environment Variable or Hardcoded Fallback
    apiKey = import.meta.env.VITE_GOOGLE_AI_KEY || "AIzaSyBdPfFlvY8nbxIpd43oakggBosHOTfTOoQ";
  } catch (e) {
    console.warn("Could not access import.meta.env");
  }

  if (!apiKey) {
    return "Vui lòng cấu hình API Key (process.env.API_KEY) để sử dụng tính năng báo cáo AI.";
  }

  if (logs.length === 0) {
    return "Chưa có dữ liệu chấm công hôm nay.";
  }

  const logSummary = logs.map(log =>
    `- ${format(log.timestamp, 'HH:mm:ss')}: ${log.type} (${log.isValidLocation ? 'Tại công ty' : 'Ngoài công ty'})`
  ).join('\n');

  const prompt = `
    Bạn là một trợ lý nhân sự thân thiện. Hãy phân tích dữ liệu chấm công của nhân viên ${userName} hôm nay.
    
    Dữ liệu:
    ${logSummary}
    
    Yêu cầu:
    1. Tóm tắt ngắn gọn lịch trình làm việc.
    2. Đưa ra nhận xét vui vẻ, động viên (ví dụ: đến sớm, về muộn, làm việc chăm chỉ).
    3. Nếu có việc chấm công "Ngoài công ty", hãy nhắc nhở nhẹ nhàng về việc tuân thủ quy định địa điểm.
    4. Trả lời bằng tiếng Việt, dùng emoji thân thiện.
    5. Giữ độ dài dưới 100 từ.
  `;

  try {
    // Dynamic import to isolate library initialization
    const { GoogleGenAI } = await import("@google/genai");

    const ai = new GoogleGenAI({ apiKey });

    // Use gemini-2.0-flash for best performance/speed balance
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });
    return response.text.trim() || "Không thể tạo báo cáo lúc này.";
  } catch (error) {
    console.error("Gemini AI Error:", error);
    return "Có lỗi xảy ra khi kết nối với AI Assistant.";
  }
};

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const chatWithAi = async (message: string, history: ChatMessage[], context: any): Promise<string> => {
  let apiKey: string | undefined;

  try {
    // Vite Environment Variable or Hardcoded Fallback
    apiKey = import.meta.env.VITE_GOOGLE_AI_KEY || "AIzaSyBdPfFlvY8nbxIpd43oakggBosHOTfTOoQ";
  } catch (e) { }

  if (!apiKey) return "Vui lòng cấu hình API Key để chat.";

  const systemPrompt = `
    Bạn là "Trợ lý ảo P&D" - chuyên gia tư vấn nhân sự của Công ty TNHH In P&D.
    
    THÔNG TIN NGỮ CẢNH:
    - Nhân viên đang hỏi: ${context.userName} (Chức vụ: ${context.userRole})
    - Thời gian hiện tại: ${new Date().toLocaleString('vi-VN')}
    - TRẠNG THÁI HÔM NAY: ${context.dailyStatus || "Không có"}
    - TIN TỨC CHUNG: ${context.generalNews || "Không có"}
    - BÁO CÁO HIỆU SUẤT CÁ NHÂN:
      ${context.performanceReport || "Chưa có dữ liệu thống kê"}
    - BÁO CÁO QUẢN TRỊ (ADMIN):
      ${context.adminReport || "Không có dữ liệu"}
    - BÁO CÁO LỊCH SỬ (THÁNG TRƯỚC):
      ${context.historicalReport || "Không có dữ liệu"}

    
    QUY ĐỊNH CÔNG TY (LUÔN GHI NHỚ):
    1. GIỜ LÀM VIỆC: 
       - Sáng: 08:00 - 12:00
       - Chiều: 13:30 - 17:30
    2. ĐI TRỄ:
       - Được phép trễ tối đa 5 phút (đến 08:05). 
       - Sau 08:05 tính là trễ và phạt toàn bộ thời gian.
       
       📋 QUY TẮC TRỪ PHỤ CẤP KHI ĐI TRỄ (quá 5 phút):
       - Lần 1/tháng: ⚠️ Nhắc nhở, không trừ tiền
       - Lần 2/tháng: 💸 Trừ 20% phụ cấp 1 tháng
       - Lần 3/tháng: 💸 Trừ 50% phụ cấp 1 tháng
       - Lần 4/tháng: 🛑 Trừ 100% phụ cấp 1 tháng
       
       📋 QUY TẮC ĐI TRỄ LIÊN TỤC:
       - Nếu 3 tháng liên tiếp đều có ≥2 lần đi trễ/tháng → Cắt thưởng các ngày lễ trong năm
       - Nếu 6 tháng liên tiếp đều có ≥2 lần đi trễ/tháng → Họp ban giám đốc để đưa ra hình thức xử lý và báo cáo lại với nhân sự
       
    3. TĂNG CA (OT):
       - Nhóm bị chặn (Kinh doanh, Kế toán, Marketing): KHÔNG tính OT tự động.
       - Làm muộn (sau 17:30): Tự động tính (với nhân viên thường).
       - Làm sớm (trước 08:00) hoặc trưa (12:00-13:30): PHẢI CÓ ĐƠN DUYỆT mới được tính.
    
    PHONG CÁCH TRẢ LỜI VÀ XỬ LÝ DỮ LIỆU:
    - Thân thiện, ngắn gọn, dùng tiếng Việt chuẩn và Emoji 😊.
    - **QUAN TRỌNG - XỬ LÝ BÁO CÁO**:
      1. Với Admin: Nếu hỏi "ai đi trễ", "tình hình nhân sự", hãy dùng dữ liệu từ [BÁO CÁO QUẢN TRỊ] để liệt kê chi tiết.
      2. Với Cá nhân: Nếu "Số lần đi trễ" > 3: Cảnh báo NGHIÊM TÚC 🛑.
      3. Nếu người dùng hỏi quy định: Giải thích ngắn gọn.
    - Nếu hỏi về lương thưởng, hướng dẫn họ xem tab "Bảng Lương".
  `;

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    // Format history for Gemini
    const chatHistory = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    // Add current message
    // Note: In real implementation, better to use startChat with history. 
    // For simplicity/statelessness here, we construct a full prompt or use simple generateContent if history is short.
    // Let's use simple prompt injection for robustness if session is not persistent.

    const fullPrompt = `${systemPrompt}\n\nLịch sử chat:\n${history.map(h => `${h.role}: ${h.text}`).join('\n')}\n\nUser: ${message}\nModel:`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: fullPrompt,
    });

    return response.text.trim() || "Xin lỗi, tôi chưa hiểu ý bạn.";
  } catch (error) {
    console.error("Chat Error:", error);
    return "Đang gặp sự cố kết nối AI.";
  }
};