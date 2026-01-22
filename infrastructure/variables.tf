variable "do_token" {
  description = "Digital Ocean API token"
  type        = string
  sensitive   = true
}

variable "ssh_key_name" {
  description = "Name of the SSH key in Digital Ocean"
  type        = string
  default     = "chrisvouga-dev-key"
}

variable "ssh_public_key_path" {
  description = "Path to the public SSH key file"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "droplet_name" {
  description = "Name of the Digital Ocean droplet"
  type        = string
  default     = "chrisvouga-dev"
}

variable "droplet_region" {
  description = "Digital Ocean region"
  type        = string
  default     = "nyc1"
}

variable "droplet_size" {
  description = "Digital Ocean droplet size slug"
  type        = string
  default     = "s-2vcpu-4gb" # 2 vCPUs, 4GB RAM, 80GB SSD
}

variable "droplet_image" {
  description = "Digital Ocean droplet image"
  type        = string
  default     = "ubuntu-22-04-x64"
}

variable "enable_reserved_ip" {
  description = "Enable reserved IP address for easier management"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to the droplet"
  type        = list(string)
  default     = ["chrisvouga-dev", "production"]
}
