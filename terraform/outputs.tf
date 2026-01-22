output "shared_ipv4" {
  description = "Shared IPv4 for DNS A records"
  value       = fly_app.projects["portfolio"].shared_ip_address
}

output "shared_ipv6" {
  description = "Shared IPv6 for DNS AAAA records"
  value       = fly_app.projects["portfolio"].shared_ipv6_address
}

output "dns_instructions" {
  description = "DNS configuration instructions"
  value       = <<-EOT
    Configure DNS records in your domain provider:
    
    @ A     ${fly_app.projects["portfolio"].shared_ip_address}
    * A     ${fly_app.projects["portfolio"].shared_ip_address}
    @ AAAA  ${fly_app.projects["portfolio"].shared_ipv6_address}
    * AAAA  ${fly_app.projects["portfolio"].shared_ipv6_address}
  EOT
}

output "service_urls" {
  description = "URLs for all deployed services"
  value = {
    for name, app in fly_app.projects :
    name => "https://${local.projects.projects[index(local.projects.projects.*.name, name)].subdomain}.chrisvouga.dev"
  }
}
