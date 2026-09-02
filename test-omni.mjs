async function test() {
  const res = await fetch("https://omniouter-vercel.vercel.app/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "auto", messages: [{"role":"user","content":"test"}] })
  });
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}
test();
