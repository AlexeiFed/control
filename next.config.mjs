/** @type {import('next').NextConfig} */
const nextConfig = {
  // Для корректной работы за Nginx (HTTPS)
  experimental: {
    // Позволяет Next.js доверять заголовкам X-Forwarded-*
    serverActions: {
      allowedOrigins: ["vityaz-erp.ru", "*.vityaz-erp.ru"]
    }
  }
};

export default nextConfig;
