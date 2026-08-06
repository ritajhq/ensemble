terraform {
  required_providers {
    dockercompose = {
      source  = "ritajhq/dockercompose"
      version = "~> 0.1"
    }
  }
}

provider "dockercompose" {}
