import { Context, Next } from 'koa';

// Middleware để xử lý và kiểm tra token trong request header
export function tokenMiddleware() {
  return async (ctx: Context, next: Next) => {
    // Lấy giá trị authorization từ header của request
    const authorization = ctx.request.headers.authorization;

    // Loại bỏ phần "Bearer " để lấy token thực tế
    const token = authorization?.replace('Bearer ', '');

    // Nếu không tìm thấy token, trả về lỗi 401 Unauthorized
    if (!token) {
      ctx.res.statusCode = 401;
      ctx.body = 'Unauthorized';
      return;
    }

    // Lưu token vào context.state để sử dụng ở các middleware hoặc controller tiếp theo
    ctx.state.token = token;

    // Tiếp tục chuỗi middleware
    await next();
  };
}