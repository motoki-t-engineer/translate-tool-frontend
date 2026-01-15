import React, { useState } from "react";

const PRESIGNED_UPLOAD_API =
  "https://owoutxnj2m.execute-api.ap-northeast-1.amazonaws.com/translate-tool-presigned-url";

const TRANSLATE_API =
  "https://owoutxnj2m.execute-api.ap-northeast-1.amazonaws.com/translate";

const PRESIGNED_DOWNLOAD_API =
  "https://owoutxnj2m.execute-api.ap-northeast-1.amazonaws.com/download-presigned-url";

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [translatedText, setTranslatedText] = useState<string>("");
  const [translatedKey, setTranslatedKey] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setFile(e.target.files[0]);
  };

  const handleUploadAndTranslate = async () => {
    if (!file) {
      alert("ファイルを選択してください");
      return;
    }

    try {
      setLoading(true);
      setStatus("Presigned URL を取得中...");

      // ① Presigned Upload URL 取得
      const presignedRes = await fetch(PRESIGNED_UPLOAD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
        }),
      });

      if (!presignedRes.ok) {
        throw new Error("Presigned API Error");
      }

      const presignedData: {
        uploadUrl: string;
        objectKey: string;
      } = await presignedRes.json();

      // ② S3 アップロード
      setStatus("S3 にアップロード中...");

      const uploadRes = await fetch(presignedData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("S3 upload failed");
      }

      // ③ 翻訳 API 呼び出し
      setStatus("翻訳処理中...");

      const translateRes = await fetch(TRANSLATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey: presignedData.objectKey,
        }),
      });

      if (!translateRes.ok) {
        const text = await translateRes.text();
        throw new Error(`Translate API Error: ${text}`);
      }

      const translateData: {
        translatedText: string;
        translatedKey: string;
      } = await translateRes.json();

      setTranslatedText(translateData.translatedText);
      setTranslatedKey(translateData.translatedKey);

      setStatus("翻訳完了 🎉");
    } catch (err) {
      console.error(err);
      setStatus("エラーが発生しました");
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!translatedKey) return;

    try {
      setStatus("ダウンロード URL 取得中...");

      const res = await fetch(
        `${PRESIGNED_DOWNLOAD_API}?objectKey=${encodeURIComponent(
          translatedKey
        )}`
      );

      if (!res.ok) {
        throw new Error("Download Presigned API Error");
      }

      const data: { downloadUrl: string } = await res.json();

      // ブラウザダウンロード
      window.location.href = data.downloadUrl;
    } catch (err) {
      console.error(err);
      alert("ダウンロードに失敗しました");
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "700px", margin: "0 auto" }}>
      <h2>PDF 翻訳ツール</h2>

      <input type="file" accept="application/pdf" onChange={handleFileChange} />

      <div style={{ marginTop: "16px" }}>
        <button onClick={handleUploadAndTranslate} disabled={loading}>
          翻訳開始
        </button>
      </div>

      <p style={{ marginTop: "16px" }}>{status}</p>

      {translatedText && (
        <>
          <h3>翻訳結果（テキスト）</h3>
          <textarea
            value={translatedText}
            readOnly
            rows={12}
            style={{ width: "100%" }}
          />
        </>
      )}

      {translatedKey && (
        <div style={{ marginTop: "16px" }}>
          <button onClick={handleDownload}>翻訳結果をダウンロード</button>
        </div>
      )}
    </div>
  );
};

export default App;
