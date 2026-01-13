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
      /* ==============================
         1. Presigned URL を取得
      ============================== */
      console.log("Calling presigned API:", UPLOAD_API);

      const presignRes = await fetch(`${UPLOAD_API}?mode=upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      });

      const raw = await presignRes.json();

      // HTTP API / REST API 両対応
      const data = typeof raw.body === "string" ? JSON.parse(raw.body) : raw;

      const { uploadUrl, objectKey } = data;

      console.log("uploadUrl:", uploadUrl);
      console.log("objectKey:", objectKey);

      if (!uploadUrl || !objectKey) {
        throw new Error("Presigned API returned invalid response");
      }

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
         3. 翻訳 Lambda を呼ぶ
      ============================== */
      console.log("Calling translate API:", TRANSLATE_API);

      const translateRes = await fetch(`${TRANSLATE_API}?mode=translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey: objectKey, // ← これが重要
        }),
      });

      const translateRaw = await translateRes.json();
      const translateData =
        typeof translateRaw.body === "string"
          ? JSON.parse(translateRaw.body)
          : translateRaw;

      if (!translateRes.ok) {
        throw new Error(
          `Translate API Error: ${translateRes.status} ${JSON.stringify(translateData)}`
        );
      }

      setResult(translateData.translatedText || "翻訳完了");
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
