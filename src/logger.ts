// Import thư viện winston để quản lý logging
import winston from 'winston';

// Tạo một instance logger với các thiết lập sau:
// - Mức log mặc định là 'info'
// - Định dạng log là JSON
// - Các phương thức vận chuyển log (transports) bao gồm:
//   1. Console: Hiển thị log ra terminal
//   2. File error.log: Lưu các log có mức 'error' vào file riêng
//   3. File combined.log: Lưu tất cả các log vào một file chung
const logger = winston.createLogger({
  level: 'info', // Cài đặt mức log mặc định
  format: winston.format.json(), // Định dạng log là JSON
  transports: [
    new winston.transports.Console(), // Log ra console
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }), // Chỉ log lỗi vào file error.log
    new winston.transports.File({ filename: 'logs/combined.log' }), // Log tất cả vào file combined.log
  ],
});

// Export module để sử dụng ở các file khác
export { logger };
