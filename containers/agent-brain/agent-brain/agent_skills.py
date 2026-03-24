"""
DaveAI Agent Skills — Combined Registry
Imports all skills from p1/p2 and exports role-grouped lists for use in brain.py
"""
from agent_skills_p1 import (
    directory_list, file_delete, file_move, file_append, grep_workspace, find_files,
    git_diff, git_push, git_pull, git_branch_create, git_branch_list,
    git_stash, git_tag, git_backup,
    zeroclaw_status, zeroclaw_shell, zeroclaw_file_write, zeroclaw_file_read,
    zeroclaw_workspace_tree, zeroclaw_http_get, zeroclaw_http_post,
    npm_run, npm_build, npm_audit,
    pm2_status, pm2_restart, pm2_logs,
    service_health, nginx_test, nginx_reload,
    docker_status, docker_restart, litellm_status,
    playwright_screenshot, mobile_screenshot, playwright_test_run, lighthouse_audit,
    eslint_run, prettier_format, typescript_check, security_scan,
    url_fetch, image_download, icon_get, npm_search,
    disk_usage, memory_usage, nginx_logs_read,
    file_patch, web_search, url_screenshot, process_list, template_apply,
)

from agent_skills_p2 import (
    color_palette,
    vision_analyze, llm_code_review, llm_generate_copy,
    llm_seo_meta, llm_summarize, llm_design_suggest,
    shadcn_add, component_scaffold, page_scaffold, api_route_create,
    env_read, ssl_check, backup_create,
    dependency_outdated, accessibility_check, broken_links_check,
    email_send, webhook_post, log_event_skill,
)

from agent_skills_p3 import (
    # Git extended
    git_log, git_reset, git_cherry_pick, git_blame,
    # Archive
    archive_create, archive_extract,
    # NPM extended
    npm_install_pkg, npm_uninstall_pkg, next_analyze,
    # PM2 extended
    pm2_save, pm2_delete, pm2_reload,
    # QA extended
    playwright_click_test, html_validate, css_lint, sitemap_check,
    # Infrastructure extended
    cron_add, cron_list, port_check, dns_lookup, log_tail,
    service_restart, tailscale_status, system_info,
    # Assets extended
    font_download, unsplash_search,
    # AI extended
    llm_fix_code, llm_write_test, llm_tailwind_suggest, image_generate,
    # Comms extended
    slack_send, discord_send,
    # Database
    db_query, db_backup,
    # SEO
    sitemap_generate, robots_write,
    # Security extended
    secret_scan, workspace_reset, input_sanitize,
)

# ── PHASE A: Critical — must have ─────────────────────────────────────────────
SKILLS_PHASE_A = [
    directory_list, file_delete, file_move, grep_workspace, find_files,
    git_diff, git_push, git_pull, git_backup,
    zeroclaw_status, zeroclaw_shell, zeroclaw_file_write, zeroclaw_file_read,
    zeroclaw_workspace_tree,
    npm_run, npm_build, pm2_status, pm2_restart, service_health,
    disk_usage, litellm_status,
    url_fetch, log_event_skill,
]

# ── PHASE B: High value — add soon ────────────────────────────────────────────
SKILLS_PHASE_B = [
    file_append, file_patch,
    git_branch_create, git_branch_list, git_stash, git_tag,
    zeroclaw_http_get, zeroclaw_http_post,
    pm2_logs, npm_audit, nginx_test, nginx_reload, docker_status, docker_restart,
    playwright_screenshot, mobile_screenshot, playwright_test_run,
    accessibility_check, broken_links_check, lighthouse_audit,
    eslint_run, prettier_format, typescript_check, security_scan, dependency_outdated,
    image_download, icon_get, npm_search, color_palette,
    vision_analyze, llm_code_review, llm_generate_copy, llm_seo_meta,
    llm_summarize, llm_design_suggest,
    shadcn_add, component_scaffold, page_scaffold, api_route_create,
    memory_usage, nginx_logs_read, env_read, ssl_check, backup_create,
    email_send, webhook_post,
    web_search, url_screenshot, process_list, template_apply,
]

# ── PHASE C: Extended — complete skillset ─────────────────────────────────────
SKILLS_PHASE_C = [
    # Git extended
    git_log, git_reset, git_cherry_pick, git_blame,
    # Archive
    archive_create, archive_extract,
    # NPM extended
    npm_install_pkg, npm_uninstall_pkg, next_analyze,
    # PM2 extended
    pm2_save, pm2_delete, pm2_reload,
    # QA extended
    playwright_click_test, html_validate, css_lint, sitemap_check,
    # Infrastructure extended
    cron_add, cron_list, port_check, dns_lookup, log_tail,
    service_restart, tailscale_status, system_info,
    # Assets extended
    font_download, unsplash_search,
    # AI extended
    llm_fix_code, llm_write_test, llm_tailwind_suggest, image_generate,
    # Comms extended
    slack_send, discord_send,
    # Database
    db_query, db_backup,
    # SEO
    sitemap_generate, robots_write,
    # Security extended
    secret_scan, workspace_reset, input_sanitize,
]

# ── Full combined list ─────────────────────────────────────────────────────────
ALL_SKILLS = SKILLS_PHASE_A + SKILLS_PHASE_B + SKILLS_PHASE_C

# ── Skills grouped by agent role ──────────────────────────────────────────────
SUPERVISOR_SKILLS = [
    directory_list, grep_workspace,
    git_diff, git_push, git_pull, git_backup, git_stash, git_log,
    pm2_status, pm2_restart, pm2_logs, pm2_save, pm2_delete, pm2_reload,
    service_health, litellm_status, zeroclaw_status,
    disk_usage, memory_usage, nginx_reload, nginx_test,
    docker_status, docker_restart, service_restart,
    email_send, log_event_skill, llm_summarize, env_read, backup_create,
    process_list, web_search,
    # Phase C additions
    cron_add, cron_list, port_check, dns_lookup, log_tail,
    tailscale_status, system_info,
    slack_send, discord_send,
    db_query, db_backup,
    secret_scan, workspace_reset,
]

CODER_SKILLS = [
    directory_list, file_delete, file_move, file_append, file_patch, grep_workspace, find_files,
    npm_run, npm_build, npm_audit, npm_install_pkg, npm_uninstall_pkg, next_analyze,
    git_diff, git_branch_create, git_stash, git_tag, git_log, git_reset, git_cherry_pick,
    shadcn_add, component_scaffold, page_scaffold, api_route_create, template_apply,
    prettier_format, eslint_run, typescript_check,
    llm_generate_copy, llm_seo_meta, llm_fix_code, llm_tailwind_suggest,
    zeroclaw_shell, zeroclaw_file_write, zeroclaw_file_read,
    web_search,
    # Phase C additions
    archive_create, archive_extract,
    sitemap_generate, robots_write,
    input_sanitize,
]

ASSET_SKILLS = [
    zeroclaw_http_get, zeroclaw_http_post, url_fetch,
    image_download, icon_get, npm_search, color_palette,
    backup_create,
    # Phase C additions
    font_download, unsplash_search, image_generate,
    archive_create, archive_extract,
    db_backup,
]

QA_SKILLS = [
    playwright_screenshot, mobile_screenshot, playwright_test_run,
    accessibility_check, broken_links_check, lighthouse_audit,
    vision_analyze, llm_code_review, llm_design_suggest,
    eslint_run, typescript_check, security_scan,
    nginx_logs_read, pm2_logs, ssl_check,
    url_screenshot,
    # Phase C additions
    playwright_click_test, html_validate, css_lint, sitemap_check,
    git_blame, llm_write_test,
    secret_scan, log_tail,
]

__all__ = [
    "ALL_SKILLS", "SKILLS_PHASE_A", "SKILLS_PHASE_B", "SKILLS_PHASE_C",
    "SUPERVISOR_SKILLS", "CODER_SKILLS", "ASSET_SKILLS", "QA_SKILLS",
]
