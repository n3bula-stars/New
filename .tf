// Placeholder Terraform file for deploying a simple container service.
// Customize with your cloud provider resources (Cloud Run / ECS / App Service) as needed.

terraform {
  required_version = ">= 1.0"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {}
variable "region" {
  default = "us-central1"
}
