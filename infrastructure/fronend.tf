resource "aws_s3_bucket" "frontend" {
  bucket_prefix = "job-tracker-frontend-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.id
}