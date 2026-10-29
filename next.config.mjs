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
 {source:'/onboarding/:path*',headers:[{key:'Cache-Control',value:'public, max-age=604800, stale-while-revalidate=2592000'}]},
 {source:'/feature/nav/:path*',headers:[{key:'Cache-Control',value:'public, max-age=604800, stale-while-revalidate=2592000'}]},
 {source:'/feature/dice/:path*',headers:[{key:'Cache-Control',value:'public, max-age=604800, stale-while-revalidate=2592000'}]},
 {source:'/pvp/:path*',headers:[{key:'Cache-Control',value:'public, max-age=604800, stale-while-revalidate=2592000'}]},
 {source:'/feature/pvp-xo-card-hd.webp',headers:[{key:'Cache-Control',value:'public, max-age=604800, stale-while-revalidate=2592000'}]},
];}};
export default nextConfig;
