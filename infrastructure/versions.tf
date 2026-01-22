terraform {
  required_version = ">= 1.5.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }

  # Note: State is stored locally in GitHub Actions runners
  # For production, consider using a remote backend (S3, Terraform Cloud, etc.)
  # to enable state locking and persistence across runs
  # Example remote backend configuration:
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "chrisvouga-dev/terraform.tfstate"
  #   region = "us-east-1"
  #   encrypt = true
  # }
}
