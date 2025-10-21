# Vagrant Installation Changes

## Summary

This document describes the updates made to the vagrant installation scripts and configuration based on improvements from issue #962.

## Key Changes

### 1. Node.js Installation via NVM

**Previous**: Direct installation of Node.js v20.10 via nodesource repository

**Current**: Node.js v22.x installed via nvm (Node Version Manager)

**Benefits**:
- Easy version switching
- Better isolation of Node.js versions
- Consistent with development scripts in `script/` directory
- Allows users to manage multiple Node.js versions

**Files Updated**:
- `deploy/vagrant/make_boxes/dtaas/user.sh`

### 2. Docker Compose Plugin

**Previous**: Standalone docker-compose v2.20 installation

**Current**: Docker compose plugin (docker-compose-plugin) installed with Docker

**Benefits**:
- Official Docker recommended approach
- Uses `docker compose` command instead of `docker-compose`
- Automatically updated with Docker
- Better integration with Docker CLI

**Files Updated**:
- `deploy/vagrant/make_boxes/dtaas/developer.sh`

### 3. Python Virtual Environment

**Previous**: System-wide pip installations

**Current**: Python packages installed in virtual environment (venv)

**Benefits**:
- Isolated Python environment
- No conflicts with system packages
- Consistent with development scripts
- Better dependency management

**Files Updated**:
- `deploy/vagrant/make_boxes/dtaas/developer.sh`

### 4. Updated Docker Image Versions

Updated to match versions in `deploy/docker` and `deploy/services`:

| Image | Previous Version | Current Version |
|-------|-----------------|-----------------|
| grafana | 10.1.4 | 11.5.2-ubuntu |
| rabbitmq | 3-management | 4.0.7-management |
| mongodb | 7.0.3 | 8.0.3 |
| gitlab-ce | 16.4.1-ce.0 | 17.9.2-ce.0 |
| gitlab-runner | N/A | alpine-v17.5.3 |

**Files Updated**:
- `deploy/vagrant/make_boxes/dtaas/user.sh`
- `deploy/vagrant/make_boxes/dtaas/developer.sh`

### 5. Vagrantfile Templates

**New**: Created reusable Vagrantfile templates in `deploy/vagrant/templates/`

**Templates**:
- `Vagrantfile.make-box.template` - For creating the base DTaaS box
- `Vagrantfile.single-machine.template` - For single machine deployment
- `Vagrantfile.two-machine.template` - For two machine deployment
- `boxes.json.template` - Configuration for two-machine setup

**Benefits**:
- Easier customization
- Clear separation of configuration
- Documented customization points
- Version control friendly

### 6. Documentation Updates

All README files updated with:
- Current software versions
- Template usage instructions
- Clearer setup steps
- Note about mkcert as openssl alternative

**Files Updated**:
- `deploy/vagrant/make_boxes/dtaas/README.md`
- `deploy/vagrant/single-machine/README.md`
- `deploy/vagrant/two-machine/README.md`

### 7. Additional Tools

Added tools to align with development scripts:
- `pm2` - Process manager for Node.js
- `madge` - Dependency graph generator
- `shellcheck` - Shell script linter

## Migration Guide

### For Existing Deployments

1. **Node.js**: Existing installations will continue to work. For new deployments, nvm will be used.

2. **Docker Compose**: Update your commands:
   - Old: `docker-compose up`
   - New: `docker compose up`

3. **Python Packages**: For developers, activate the venv:
   ```bash
   source ~/dtaas-venv/bin/activate
   ```

### For New Deployments

1. Use the templates in `deploy/vagrant/templates/`
2. Follow the updated README instructions
3. All new features are automatically included

## Certificate Generation Note

While openssl remains installed for backward compatibility, consider using [mkcert](https://github.com/FiloSottile/mkcert) for local development certificates. mkcert provides:
- Automatic trusted certificate installation
- Simpler workflow
- Better browser compatibility

## Compatibility

- Base OS: Ubuntu 22.04 LTS (Jammy)
- Vagrant: Compatible with existing Vagrant installations
- VirtualBox: No changes required
- All changes are backward compatible for existing boxes
