terraform {
  required_version = ">= 1.16.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "eu-west-2"

  default_tags {
    tags = {
      Project     = "job-application-tracker"
      Environment = "lab"
      ManagedBy   = "Terraform"
      Owner       = "Kelechi Ogboi"
    }
  }
}