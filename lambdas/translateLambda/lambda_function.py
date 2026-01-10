import json
import os
import uuid
from io import BytesIO

import boto3
from PyPDF2 import PdfReader
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

# AWS Clients
s3 = boto3.client("s3")
textract = boto3.client("textract")
translate = boto3.client("translate")

# ==============================
# 環境変数
# ==============================
BUCKET_NAME = os.environ.get("BUCKET_NAME")
UPLOAD_PREFIX = os.environ.get("UPLOAD_PREFIX", "uploads")
TRANSLATED_PREFIX = os.environ.get("TRANSLATED_PREFIX", "translated")

MAX_PAGES = 10  # PDFページ制限


# ==============================
# Lambda エントリポイント
# ==============================
def lambda_handler(event, context):
    """
    翻訳処理 Lambda
    API Gateway (HTTP API) 経由想定

    body:
    {
      "objectKey": "uploads/xxx.pdf"
    }
    """

    try:
        # -------- API Gateway body パース --------
        body = json.loads(event.get("body", "{}"))
        file_key = body.get("objectKey")

        if not file_key:
            return response(
                400,
                {"message": "objectKey is required"}
            )

        # -------- S3 からファイル取得 --------
        file_obj = s3.get_object(Bucket=BUCKET_NAME, Key=file_key)
        file_bytes = file_obj["Body"].read()

        # -------- ファイル種別判定 --------
        if file_key.lower().endswith(".pdf"):
            extracted_text = extract_text_from_pdf(file_bytes)
        else:
            extracted_text = extract_text_from_image(file_bytes)

        if not extracted_text.strip():
            return response(
                400,
                {"message": "テキストを抽出できませんでした"}
            )

        # -------- 翻訳 --------
        translated_text = translate_text(extracted_text)

        # -------- PDF生成 --------
        translated_pdf_bytes = generate_pdf(translated_text)

        # -------- S3保存 --------
        translated_key = save_to_s3(translated_pdf_bytes)

        # -------- ダウンロード用 Presigned URL --------
        download_url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": BUCKET_NAME,
                "Key": translated_key
            },
            ExpiresIn=3600  # 1時間
        )

        return response(
            200,
            {
                "translatedKey": translated_key,
                "downloadUrl": download_url
            }
        )

    except Exception as e:
        print("Error:", str(e))
        return response(
            500,
            {
                "message": "翻訳処理中にエラーが発生しました",
                "error": str(e)
            }
        )


# ==============================
# 共通レスポンス（API Gateway 用）
# ==============================
def response(status_code, body_dict):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "POST,OPTIONS"
        },
        "body": json.dumps(body_dict)
    }


# ==============================
# PDF テキスト抽出
# ==============================
def extract_text_from_pdf(file_bytes):
    """
    テキストPDF向け抽出
    10ページ制限あり
    """

    pdf = PdfReader(BytesIO(file_bytes))
    num_pages = len(pdf.pages)

    if num_pages > MAX_PAGES:
        raise Exception(
            f"PDF page limit exceeded: {num_pages} pages (max {MAX_PAGES})"
        )

    text = ""
    for page in pdf.pages:
        text += page.extract_text() or ""

    # テキストが取れなかった場合は画像扱い
    if not text.strip():
        return extract_text_from_image(file_bytes)

    return text


# ==============================
# 画像 OCR（Textract）
# ==============================
def extract_text_from_image(file_bytes):
    """
    JPG / PNG / スクリーンショット想定
    """
    response = textract.detect_document_text(
        Document={"Bytes": file_bytes}
    )

    lines = []
    for block in response.get("Blocks", []):
        if block["BlockType"] == "LINE":
            lines.append(block["Text"])

    return "\n".join(lines)


# ==============================
# 翻訳（Amazon Translate）
# ==============================
def translate_text(text):
    response = translate.translate_text(
        Text=text,
        SourceLanguageCode="en",
        TargetLanguageCode="ja"
    )
    return response["TranslatedText"]


# ==============================
# PDF生成（reportlab）
# ==============================
def generate_pdf(text):
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    x = 50
    y = height - 50
    line_height = 14

    for line in text.split("\n"):
        if y < 50:
            c.showPage()
            y = height - 50
        c.drawString(x, y, line)
        y -= line_height

    c.save()
    buffer.seek(0)
    return buffer.read()


# ==============================
# S3 保存
# ==============================
def save_to_s3(pdf_bytes):
    filename = f"{uuid.uuid4()}-translated.pdf"
    key = f"{TRANSLATED_PREFIX}/{filename}"

    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=key,
        Body=pdf_bytes,
        ContentType="application/pdf"
    )

    return key
