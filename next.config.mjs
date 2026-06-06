/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
      // Pexels
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      // Unsplash
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // Pixabay
      {
        protocol: "https",
        hostname: "pixabay.com",
      },
      {
        protocol: "https",
        hostname: "cdn.pixabay.com",
      },
      // Openverse (images come from many sources)
      {
        protocol: "https",
        hostname: "*.openverse.org",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "live.staticflickr.com",
      },
    ],
  },
};

export default nextConfig;
