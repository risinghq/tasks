UPDATE `workspaces` SET `name` = (SELECT `name` FROM `users` WHERE `users`.`id` = `workspaces`.`id`)
WHERE `name` = 'Personal' AND `id` IN (SELECT `id` FROM `users`);
