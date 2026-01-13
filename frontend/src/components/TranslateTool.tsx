import { useState } from "react";

const UPLOAD_API = import.meta.env.VITE_UPLOAD_API;
const TRANSLATE_API = import.meta.env.VITE_TRANSLATE_API;

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadAndTranslate = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      console.log("Calling presigned API:", UPLOAD_API);

      /* ==============================
         1. Presigned URL を取得
      ============================== */
      const presignRes = await fetch(`${UPLOAD_API}?mode=upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!presignRes.ok) {
        const t = await presignRes.text();
        throw new Error(`Presigned API Error: ${presignRes.status} ${t}`);
      }

      const raw = await presignRes.json();              // ← API Gateway の生レスポンス
      const { uploadUrl, objectKey } = JSON.parse(raw.body);   // ← ★ここが本体

      console.log("uploadUrl:", uploadUrl);
      console.log("objectKey:", objectKey);

      /* ==============================
         2. S3 に直接アップロード
      ============================== */
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("S3 upload failed");
      }

      console.log("S3 upload success");

      /* ==============================
         3. 翻訳 API を呼ぶ
      ============================== */
      console.log("Calling translate API:", TRANSLATE_API);

      const translateRes = await fetch(`${TRANSLATE_API}?mode=translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey,   // ← ★ここが最重要
        }),
      });

      if (!translateRes.ok) {
        const t = await translateRes.text();
        throw new Error(`Translate API Error: ${translateRes.status} ${t}`);
      }

      const data = await translateRes.json();
      setResult(data.translatedText || "翻訳完了");
    } catch (err: any) {
      console.error("Upload & Translate failed:", err);
      setError(err.message || "不明なエラー");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "auto" }}>
      <h1>PDF / 画像 翻訳ツール</h1>

      <input
        type="file"
        accept=".pdf,image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <br />
      <br />

      <button onClick={uploadAndTranslate} disabled={!file || uploading}>
        {uploading ? "処理中..." : "アップロード & 翻訳"}
      </button>

      {error && (
        <p style={{ color: "red", marginTop: "1rem" }}>
          ❌ {error}
        </p>
      )}

      {result && (
        <div style={{ marginTop: "1rem", whiteSpace: "pre-wrap" }}>
          <h3>翻訳結果</h3>
          <pre>{result}</pre>
        </div>
      )}
    </div>
  );
}
