terraform {
  required_version = ">= 1.6"

  cloud {
    organization = "crvouga"
    workspaces {
      name = "portfolio"
    }
  }

  required_providers {
    fly = {
      source  = "fly-apps/fly"
      version = "~> 0.1"
    }
  }
}

provider "fly" {
  fly_api_token = var.fly_api_token
}
