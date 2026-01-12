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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      });

      const presignText = await presignRes.text();
      if (!presignRes.ok) {
        throw new Error(`Presigned API Error: ${presignRes.status} ${presignText}`);
      }

      const presignData = JSON.parse(presignText);
      const { uploadUrl, key } = presignData;

      if (!uploadUrl || !key) {
        throw new Error("Presigned API のレスポンスに uploadUrl または key がありません");
      }

      console.log("uploadUrl:", uploadUrl);
      console.log("s3 key:", key);

      /* ==============================
         2. S3 に直接アップロード
      ============================== */
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          // Presigned URL の署名と一致させる
          "Content-Type": file.type || "application/octet-stream",
        },
      });

      if (!uploadRes.ok) {
        const t = await uploadRes.text();
        throw new Error(`S3 Upload Error: ${uploadRes.status} ${t}`);
      }

      console.log("S3 upload success");

      /* ==============================
         3. 翻訳 Lambda を呼ぶ
      ============================== */
      console.log("Calling translate API:", TRANSLATE_API);

      const translateRes = await fetch(`${TRANSLATE_API}?mode=translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          s3Key: key,
        }),
      });

      const translateText = await translateRes.text();
      if (!translateRes.ok) {
        throw new Error(`Translate API Error: ${translateRes.status} ${translateText}`);
      }

      const data = JSON.parse(translateText);

      setResult(data.translatedText || "翻訳が完了しました");

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

      <br /><br />

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
