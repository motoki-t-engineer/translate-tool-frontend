// presignedUrlLambda/index.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION || "ap-northeast-1";
const BUCKET_NAME = process.env.UPLOAD_BUCKET;

const s3Client = new S3Client({ region: REGION });

export const handler = async (event) => {
  try {
    console.log("Received event:", JSON.stringify(event));

    // API Gateway から送られた body をパース
    const body = JSON.parse(event.body);

    const { fileName, contentType } = body;

    if (!fileName || !contentType) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "fileName と contentType は必須です。" }),
      };
    }

    // 保存先キー
    // uploads/{UUID}/{fileName}
    const objectKey = `uploads/${Date.now()}-${fileName}`;

    // PutObject 用の presigned URL を発行
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 * 5 }); // 5分

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
      body: JSON.stringify({
        uploadUrl: presignedUrl,
        objectKey,
      }),
    };
  } catch (error) {
    console.error("Error generating presigned URL:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Presigned URL の生成に失敗しました",
        error: error.message,
      }),
    };
  }
};
