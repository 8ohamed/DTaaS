#!/bin/bash
# Installs necessary packages to create the docker environment for 
# executing the DTaaS application

apt-get update -y
apt-get upgrade -y

# https://docs.docker.com/engine/install/ubuntu/
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    zsh \
    apache2-utils \
    net-tools \
    python3-dev \
    python3-pip \
    python3-venv

mkdir -p /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]
then
  curl -fsSL "https://download.docker.com/linux/ubuntu/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  printf \
    "deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu %s stable" \
    "$(dpkg --print-architecture)" "$(lsb_release -cs)"  | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
fi

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
groupadd docker || true
usermod -aG docker vagrant || true
newgrp docker || true
service docker start
docker run hello-world

systemctl enable docker.service
systemctl enable containerd.service

# Install nodejs using nvm
apt-get install -y ca-certificates curl gnupg

# Install nvm for vagrant user
sudo -u vagrant bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash'
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

cat /vagrant/vagrant.pub >> /home/vagrant/.ssh/authorized_keys
mkdir -p /root/.ssh
cat /vagrant/vagrant.pub >> /root/.ssh/authorized_keys

# get the required docker images
docker pull traefik:v2.10
docker pull mltooling/ml-workspace-minimal:0.13.2
docker pull grafana/grafana:11.5.2-ubuntu
docker pull influxdb:2.7
docker pull rabbitmq:4.0.7-management
docker pull eclipse-mosquitto:2
docker pull mongo:8.0.3
docker pull gitlab/gitlab-ce:17.9.2-ce.0

# remove default route inserted by vagrant
printf "* * * * * ip route del default via 10.0.2.2 dev enp0s3\n" | crontab -