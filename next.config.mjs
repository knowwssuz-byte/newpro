/** @type {import('next').NextConfig} */
const securityHeaders=[
 {key:'X-Content-Type-Options',value:'nosniff'},
 {key:'Referrer-Policy',value:'no-referrer'},
 {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=(self)'},
 {key:'Strict-Transport-Security',value:'max-age=31536000; includeSubDomains'},
 {key:'Content-Security-Policy',value:"object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org; form-action 'self'; upgrade-insecure-requests"}
];
const nextConfig={async headers(){return [
 {source:'/:path*',headers:securityHeaders},
 {source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'}]},
 {source:'/feature/game-banners/:path*',headers:[{key:'Cache-Control',value:'public, max-age=86400, stale-while-revalidate=604800'}]},
 {source:'/onboarding/:path*',headers:[{key:'Cache-Control',value:'public, max-age=86400, stale-while-revalidate=604800'}]},
];}};
export default nextConfig;
