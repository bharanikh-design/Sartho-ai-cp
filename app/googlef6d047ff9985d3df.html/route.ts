export function GET() {
  return new Response("google-site-verification: googlef6d047ff9985d3df.html", {
    headers: {
      "Content-Type": "text/html",
    },
  });
}
