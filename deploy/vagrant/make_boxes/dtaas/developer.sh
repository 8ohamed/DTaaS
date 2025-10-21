#!/bin/bash
# Installs necessary packages to create the docker environment for
# executing the DTaaS application

apt-get update -y
apt-get upgrade -y

# docker-compose is now installed as docker compose plugin via docker-compose-plugin package in user.sh

# Install openssl for certificate generation
# Note: Consider using mkcert as an alternative for local development certificates
# mkcert can be installed from: https://github.com/FiloSottile/mkcert
apt-get install -y wget openssl

# Install nodejs using nvm
apt-get install -y ca-certificates curl gnupg

# Install nvm for vagrant user
sudo -u vagrant bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash'
sudo -u vagrant bash -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm install 22 && nvm use 22 && nvm alias default 22'

# Install yarn
if [ ! -f /usr/share/keyrings/yarnkey.gpg ]
then
  curl -sL "https://dl.yarnpkg.com/debian/pubkey.gpg" | gpg --dearmor | \
    tee /usr/share/keyrings/yarnkey.gpg >/dev/null
  printf "deb [signed-by=/usr/share/keyrings/yarnkey.gpg] https://dl.yarnpkg.com/debian stable main \n" | \
    tee /etc/apt/sources.list.d/yarn.list
fi
apt-get update -y
apt-get install -y yarn

# Install global npm packages
sudo -u vagrant bash -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && npm install -g serve pm2 madge'

# Install playwright tool for integration tests on browsers
npx --yes playwright install-deps

#-------------
printf "\n\n Install jupyterlab and mkdocs"
# Create a python virtual environment for the vagrant user
sudo -u vagrant bash -c 'cd /home/vagrant && python3 -m venv ./dtaas-venv'
sudo -u vagrant bash -c 'cd /home/vagrant && ./dtaas-venv/bin/pip3 install jupyterlab mkdocs mkdocs-material python-markdown-math mkdocs-open-in-new-tab mkdocs-with-pdf qrcode'

# Install markdownlint
sudo apt-get install -y rubygems
sudo gem install mdl

# Install shellcheck
sudo apt-get install -y shellcheck

# Install madge for generating dependency graphs of typescript projects
sudo apt-get install -y graphviz
# madge is already installed via npm above