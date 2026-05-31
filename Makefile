SHELL := /usr/bin/env bash

ROOT := $(shell cd "$(dir $(lastword $(MAKEFILE_LIST)))" && pwd)
SCRIPTS := $(ROOT)/scripts
DIST_DIR ?= dist/skill-packages
SELECTOR ?=
INSTALL_SELECTOR = $(or $(SELECTOR),all)
SCOPE ?= all

.PHONY: help install-global update-global install-repo update-repo install-status install-check link-skills update-link package-all package-one validate validate-fast validate-repo validate-all clean

help:
	@echo "Targets:"
	@echo "  make validate-repo               # gate validate (primary)"
	@echo "  make validate                    # affected validation plan (alias of validate-repo)"
	@echo "  make validate-fast               # universal preflight only"
	@echo "  make validate-all                # full validation sweep"
	@echo "  make install-global [SELECTOR=all]       # link skills into global Agent and Claude pickup dirs"
	@echo "  make update-global [SELECTOR=all]        # force-refresh global Agent and Claude skill links"
	@echo "  make install-repo REPO=<dir> [SELECTOR=all]   # link skills into one repo .codex/skills and .claude/skills"
	@echo "  make update-repo REPO=<dir> [SELECTOR=all]    # force-refresh repo-local Codex and Claude links"
	@echo "  make install-status [SELECTOR=all] [SCOPE=all] [REPO=dir] # report install state"
	@echo "  make install-check [SELECTOR=all] [SCOPE=all] [REPO=dir]  # strict install state check"
	@echo "  make link-skills DEST=<dir> [SELECTOR=all] [FORCE=1]      # explicit low-level link"
	@echo "  make update-link DEST=<dir> [SELECTOR=all]                # force-refresh explicit link target"
	@echo "  make package-all [DIST_DIR=...]         # write .skill archives for discovered installable skill sources"
	@echo "  make package-one SELECTOR=<selector>    # write .skill archives for one selector"
	@echo "  make clean                       # remove generated local artifacts"

install-global:
	@cd "$(ROOT)" && bash scripts/skill.sh install --selector "$(INSTALL_SELECTOR)" --scope global

update-global:
	@cd "$(ROOT)" && bash scripts/skill.sh install --selector "$(INSTALL_SELECTOR)" --scope global --force

install-repo:
	@if [[ -z "$(REPO)" ]]; then \
		echo "Usage: make install-repo REPO=<consumer-repo> [SELECTOR=all]" >&2; \
		exit 1; \
	fi
	@cd "$(ROOT)" && bash scripts/skill.sh install --selector "$(INSTALL_SELECTOR)" --scope repo-local --repo "$(REPO)"

update-repo:
	@if [[ -z "$(REPO)" ]]; then \
		echo "Usage: make update-repo REPO=<consumer-repo> [SELECTOR=all]" >&2; \
		exit 1; \
	fi
	@cd "$(ROOT)" && bash scripts/skill.sh install --selector "$(INSTALL_SELECTOR)" --scope repo-local --repo "$(REPO)" --force

install-status:
	@cd "$(ROOT)" && bash scripts/skill.sh install-status --selector "$(INSTALL_SELECTOR)" --scope "$(SCOPE)" $(if $(REPO),--repo "$(REPO)",)

install-check:
	@cd "$(ROOT)" && bash scripts/skill.sh install-status --selector "$(INSTALL_SELECTOR)" --scope "$(SCOPE)" $(if $(REPO),--repo "$(REPO)",) --strict

link-skills:
	@if [[ -z "$(DEST)" ]]; then \
		echo "Usage: make link-skills DEST=<target-skills-dir> [SELECTOR=all] [FORCE=1]" >&2; \
		exit 1; \
	fi
	@cd "$(ROOT)" && bash scripts/skill.sh link --selector "$(INSTALL_SELECTOR)" --dest "$(DEST)" $(if $(FORCE),--force,)

update-link:
	@if [[ -z "$(DEST)" ]]; then \
		echo "Usage: make update-link DEST=<target-skills-dir> [SELECTOR=all]" >&2; \
		exit 1; \
	fi
	@cd "$(ROOT)" && bash scripts/skill.sh link --selector "$(INSTALL_SELECTOR)" --dest "$(DEST)" --force

package-all:
	cd scripts && bash skill.sh distribute-package --dist "$(DIST_DIR)"

package-one:
	@if [[ -z "$(SELECTOR)" ]]; then \
		echo "Usage: make package-one SELECTOR=<all|family|family/skill-id|skill-id>" >&2; \
		exit 1; \
	fi
	cd scripts && bash skill.sh distribute-package --dist "$(DIST_DIR)" --selector "$(SELECTOR)"

validate:
	cd scripts && bash gate.sh validate

validate-fast:
	cd scripts && bash gate.sh validate-fast

validate-repo:
	cd scripts && bash gate.sh validate

validate-all:
	cd scripts && bash gate.sh validate-all

clean:
	rm -rf .tmp dist dist_* .dist-* site tmp
