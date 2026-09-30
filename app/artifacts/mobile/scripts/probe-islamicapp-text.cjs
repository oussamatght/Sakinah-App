/** حجم حمولة /text لكتاب إسلاميك: هل يجلب الكتاب كاملًا في طلب واحد؟ */
const url = process.argv[2] || "https://api.islamic.app/v1/library/books/iqtitaf-azahir/text";

(async () => {
  const t0 = Date.now();
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const ms = Date.now() - t0;
  const json = JSON.parse(buf.toString("utf8"));
  const d = json.data;
  const chapters = Array.isArray(d.chapters) ? d.chapters : [];
  const withText = chapters.filter((c) => c && c.text);
  const totalChars = withText.reduce((n, c) => n + String(c.text).length, 0);
  const biggest = withText
    .map((c) => String(c.text).length)
    .sort((a, b) => b - a)
    .slice(0, 3);

  console.log("url:", url);
  console.log("status:", res.status, "bytes:", buf.length, "ms:", ms);
  console.log("pageCount:", d.pageCount, "chapterCount:", d.chapterCount, "source:", d.source);
  console.log("chapters:", chapters.length, "with text:", withText.length);
  console.log("total text chars:", totalChars);
  console.log("largest chapter char counts:", biggest.join(", "));
  console.log("keys:", Object.keys(d).join(","));
  console.log("chapter keys:", chapters[0] ? Object.keys(chapters[0]).join(",") : "(none)");
  console.log("sample text:", String(withText[0]?.text ?? "").slice(0, 220));
})();
