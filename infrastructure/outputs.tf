output "droplet_ip" {
  description = "IP address of the droplet"
  value       = digitalocean_droplet.main.ipv4_address
}

output "droplet_id" {
  description = "ID of the droplet"
  value       = digitalocean_droplet.main.id
}

output "reserved_ip" {
  description = "Reserved IP address (if enabled)"
  value       = var.enable_reserved_ip ? digitalocean_reserved_ip.main[0].ip_address : null
}

output "ssh_connection_command" {
  description = "SSH command to connect to the droplet"
  value       = "ssh root@${digitalocean_droplet.main.ipv4_address}"
}

output "firewall_id" {
  description = "ID of the firewall"
  value       = digitalocean_firewall.main.id
}
