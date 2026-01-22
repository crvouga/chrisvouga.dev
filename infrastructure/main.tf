provider "digitalocean" {
  token = var.do_token
}

# Read SSH public key
data "local_file" "ssh_public_key" {
  filename = pathexpand(var.ssh_public_key_path)
}

# Upload SSH key to Digital Ocean
resource "digitalocean_ssh_key" "main" {
  name       = var.ssh_key_name
  public_key = data.local_file.ssh_public_key.content
}

# Create droplet first (needed for firewall droplet_ids reference)
resource "digitalocean_droplet" "main" {
  image    = var.droplet_image
  name     = var.droplet_name
  region   = var.droplet_region
  size     = var.droplet_size
  ssh_keys = [digitalocean_ssh_key.main.id]
  tags     = var.tags

  # User data script for initial setup
  user_data = <<-EOF
    #!/bin/bash
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get upgrade -y
    apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
  EOF
}

# Create firewall and attach to droplet
resource "digitalocean_firewall" "main" {
  name        = "${var.droplet_name}-firewall"
  droplet_ids = [digitalocean_droplet.main.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# Optional: Create reserved IP
resource "digitalocean_reserved_ip" "main" {
  count  = var.enable_reserved_ip ? 1 : 0
  region = var.droplet_region
}

# Assign reserved IP to droplet if enabled
resource "digitalocean_reserved_ip_assignment" "main" {
  count      = var.enable_reserved_ip ? 1 : 0
  ip_address = digitalocean_reserved_ip.main[0].ip_address
  droplet_id = digitalocean_droplet.main.id
}
