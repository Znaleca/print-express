export default function manifest() {
  return {
    name: "Press & Present",
    short_name: "Press & Present",
    description: "Discover printing shops and manage print jobs online.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f2",
    theme_color: "#1a1a1a",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
