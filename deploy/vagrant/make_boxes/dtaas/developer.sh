#!/bin/bash
# Installs necessary packages to create the docker environment for 
# executing the DTaaS application

apt-get update -y
apt-get upgrade -y

# docker-compose is now installed as docker compose plugin via docker-compose-plugin package in user.sh

# Install openssl for certificate generation
apt-get install -y wget openssl

# Install playwright tool for integration tests on browsers
npx --yes playwright install-deps

#-------------
printf "\n\n Install jupyterlab and mkdocs"
# Create a python virtual environment for the vagrant user
sudo -u vagrant bash -c 'cd /home/vagrant && python3 -m venv ./dtaas-venv'
sudo -u vagrant bash -c 'cd /home/vagrant && ./dtaas-venv/bin/pip3 install jupyterlab mkdocs mkdocs-material python-markdown-math mkdocs-open-in-new-tab mkdocs-with-pdf qrcode'

# Install minimal Kubernetes cluster
snap install microk8s --classic
usermod -a -G microk8s vagrant
chown -f -R vagrant ~/.kube
newgrp microk8s

# get the required docker images
docker pull telegraf:1.28.2
docker pull gitlab/gitlab-runner:alpine-v17.5.3

# Install markdownlint
sudo apt-get install -y rubygems
sudo gem install mdl

# Install shellcheck
sudo apt-get install -y shellcheck

# Install madge for generating dependency graphs of typescript projects
sudo apt-get install -y graphviz
# madge is already installed via npm in user.sh