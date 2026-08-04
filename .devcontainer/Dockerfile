FROM ubuntu:26.04

USER root

# Delete ubuntu user and group
RUN userdel --remove ubuntu

# Install necessary packages
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    wget \
    git \
    vim \
    zsh \
    sudo \
    jq \
    unzip \
    zip \
    && rm -rf /var/lib/apt/lists/*

# Set Zsh as the default shell
SHELL ["/bin/zsh", "-c"]

RUN echo 'export HISTFILE=/commandhistory/.zsh_history' >> /etc/zsh/zshrc \
    && echo 'setopt INC_APPEND_HISTORY' >> /etc/zsh/zshrc \
    && echo 'setopt SHARE_HISTORY' >> /etc/zsh/zshrc

RUN mkdir -p /commandhistory \
    && chmod 777 /commandhistory

# Create developer user, assign sudo privileges, and set uid and gid to 1000
RUN useradd -ms /bin/zsh developer && usermod -u 1000 developer && groupmod -g 1000 developer && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

RUN chown developer:developer /commandhistory

# Install Deno
ENV DENO_INSTALL=/usr/local
RUN curl -fsSL https://deno.land/install.sh | sh -s -- -y \
    && chmod -R a+rX /usr/local/bin/deno

# Switch to developer user
USER developer

COPY ./build/install.sh /home/developer/install.sh
# COPY ./build/terraform-provider-dockercompose /home/developer/.terraform.d/plugin-bin/terraform-provider-dockercompose
RUN sudo chmod +x /home/developer/install.sh && /home/developer/install.sh

# Set the working directory
WORKDIR /home/developer/workspace
RUN sudo chown -R developer:developer /home/developer

ARG WORKSPACE_DIR=/home/developer/workspace

