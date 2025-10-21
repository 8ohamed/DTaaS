# Vagrantfile Templates

This directory contains template Vagrantfiles for different DTaaS deployment scenarios.

## Available Templates

### 1. Vagrantfile.make-box.template

Template for creating the base DTaaS vagrant box.

**Location**: Copy to `deploy/vagrant/make_boxes/dtaas/Vagrantfile`

**Usage**:
- Customize hostname and MAC address
- Uncomment developer.sh provisioning line if needed
- Run `vagrant up` to create the box

### 2. Vagrantfile.single-machine.template

Template for single machine deployment.

**Location**: Copy to `deploy/vagrant/single-machine/Vagrantfile`

**Usage**:
- Customize hostname and MAC address
- Ensure vagrant private key is available
- Run `vagrant up` to deploy

### 3. Vagrantfile.two-machine.template

Template for two machine deployment.

**Location**: Copy to `deploy/vagrant/two-machine/Vagrantfile`

**Usage**:
- Customize `boxes.json` with your server configurations
- Ensure vagrant private key is available
- Run `vagrant up --provision services` for services machine
- Run `vagrant up --provision dtaas` for main DTaaS machine

### 4. boxes.json.template

Template configuration for two-machine deployment.

**Location**: Copy to `deploy/vagrant/two-machine/boxes.json`

**Usage**:
- Customize server names, hostnames, and MAC addresses
- Adjust ports if needed

## Customization

All templates include `CUSTOMIZE:` comments indicating fields that should be modified for your deployment:

- **hostname**: Your domain name or desired hostname
- **MAC address**: Required if using DHCP with DNS assignment
- **vagrant private key path**: Path to your vagrant SSH private key

## Notes

- Make sure to create the dtaas vagrant box first using the make-box template
- Keep your vagrant private key secure and reference it correctly in deployments
- Update network configuration based on your infrastructure requirements
