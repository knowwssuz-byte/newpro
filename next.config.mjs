/** @type {import('next').NextConfig} */
const securityHeaders=[
 {key:'X-Content-Type-Options',value:'nosniff'},
 {key:'Referrer-Policy',value:'no-referrer'},
 {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=(self)'},
 {key:'Strict-Transport-Security',value:'max-age=31536000; includeSubDomains'},
 {key:'Content-Security-Policy',value:"object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org; form-action 'self'; upgrade-insecure-requests"}
];
const nextConfig={
 images:{
  remotePatterns:[
   {protocol:'https',hostname:'ylcipsfuojjvsqowbpol.supabase.co',pathname:'/storage/v1/object/public/**'},
   {protocol:'https',hostname:'newpro-blue.vercel.app',pathname:'/**'}
  ],
  formats:['image/webp'],
  qualities:[72,75,76,78],
  imageSizes:[48,64,96,128,160,192,256,384],
  deviceSizes:[320,420,640,768,1080,1280],
  minimumCacheTTL:3600
 },
 async headers(){return [
 {source:'/:path*',headers:securityHeaders},
 {source:'/admin/:path*',headers:[
  {key:'Cache-Control',value:'private, no-store, max-age=0'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'Content-Security-Policy',value:"object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"}
 ]},
 {source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'}]},
 {source:'/feature/game-banners/:path*',headers:[{key:'Cache-Control',value:'public, max-age=86400, stale-while-revalidate=604800'}]},
 {source:'/onboarding/:path*',headers:[{key:'Cache-Control',value:'public, max-age=604800, stale-while-revalidate=2592000'}]},
 {source:'/feature/nav/:path*',headers:[{key:'Cache-Control',value:'public, max-age=3600, stale-while-revalidate=86400'}]},
 {source:'/feature/dice/:path*',headers:[{key:'Cache-Control',value:'public, max-age=3600, stale-while-revalidate=86400'}]},
 {source:'/pvp/:path*',headers:[{key:'Cache-Control',value:'public, max-age=3600, stale-while-revalidate=86400'}]},
 {source:'/feature/pvp-xo-card-hd.webp',headers:[{key:'Cache-Control',value:'public, max-age=3600, stale-while-revalidate=86400'}]},
];}};
export default nextConfig;
