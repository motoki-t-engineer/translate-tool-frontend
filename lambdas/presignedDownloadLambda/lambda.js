// presignedDownloadLambda/index.js
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const BUCKET_NAME = process.env.UPLOAD_BUCKET; // translate-tool-upload-bucket

const s3Client = new S3Client({ region: REGION });

exports.handler = async (event) => {
  try {
    console.log("Received event:", JSON.stringify(event));

    const params = event.queryStringParameters || {};
    const objectKey = params.objectKey;

    // バリデーション
    if (!objectKey) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ message: "objectKey is required" }),
      };
    }

    // セキュリティ対策：translated 配下のみ許可
    if (!objectKey.startsWith("translated/")) {
      return {
        statusCode: 403,
        headers: corsHeaders(),
        body: JSON.stringify({ message: "Access denied" }),
      };
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
    });

    // Presigned URL（5分）
    const downloadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 60 * 5,
    });

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        downloadUrl,
        objectKey,
      }),
    };
  } catch (error) {
    console.error("Error generating download presigned URL:", error);

    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({
        message: "Failed to generate download presigned URL",
        error: error.message,
      }),
    };
  }
};

// 共通CORSヘッダー
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };
}
