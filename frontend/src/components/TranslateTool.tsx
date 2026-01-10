import React, { useState } from "react";

const API_BASE = "https://owoutxnj2m.execute-api.ap-northeast-1.amazonaws.com"; // ← ここだけ変更

export default function TranslateTool() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [translatedUrl, setTranslatedUrl] = useState<string | null>(null);
  const [uploadedKey, setUploadedKey] = useState<string>("");

  // ========== Step 1: ファイル選択 ==========
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setTranslatedUrl(null); // 前回分リセット
    }
  };

  // ========== Step 2: S3 にアップロード ==========
  const uploadFile = async () => {
    if (!file) return;
    setUploading(true);

    try {
      // Presigned URL を Lambda 経由で取得
      const res = await fetch(`${API_BASE}/translate?mode=upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      });

      const { uploadUrl, objectKey } = await res.json();

      // S3 に PUT
      const s3Res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!s3Res.ok) throw new Error("S3 アップロード失敗");

      setUploadedKey(objectKey);
      alert("アップロード完了");

    } catch (err) {
      console.error(err);
      alert("アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  // ========== Step 3: 翻訳処理実行 ==========
  const processTranslation = async () => {
    if (!uploadedKey) return;

    setProcessing(true);

    try {
      const res = await fetch(`${API_BASE}/translate?mode=process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey: uploadedKey }),
      });

      const { downloadUrl } = await res.json();

      setTranslatedUrl(downloadUrl);

      alert("翻訳完了しました！");

    } catch (err) {
      console.error(err);
      alert("翻訳処理に失敗しました");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px" }}>
      <h2>翻訳ツール（PDF / 画像対応）</h2>

      {/* Step 1: ファイル選択 */}
      <div>
        <input type="file" onChange={onFileChange} />
      </div>

      {/* Step 2: S3 アップロード */}
      <button
        disabled={!file || uploading}
        onClick={uploadFile}
        style={{ marginTop: "10px" }}
      >
        {uploading ? "アップロード中..." : "ファイルをアップロード"}
      </button>

      {/* Step 3: 翻訳処理実行 */}
      <button
        disabled={!uploadedKey || processing}
        onClick={processTranslation}
        style={{ marginTop: "10px", marginLeft: "10px" }}
      >
        {processing ? "翻訳中..." : "翻訳を実行"}
      </button>

      {/* Step 4: ダウンロードリンク表示 */}
      {translatedUrl && (
        <div style={{ marginTop: "20px" }}>
          <p>翻訳済みドキュメント：</p>
          <a href={translatedUrl} download>
            ここをクリックしてダウンロード
          </a>
        </div>
      )}
    </div>
  );
}
