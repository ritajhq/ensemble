terraform {
  required_providers {
    dockercompose = {
      source  = "ritajhq/dockercompose"
      version = "~> 0.2"
    }
  }
}

provider "dockercompose" {}
