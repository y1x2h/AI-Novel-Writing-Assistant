-- CharacterState 增加伤势与持有物字段，用于角色当前状态的确定性查询
ALTER TABLE "CharacterState" ADD COLUMN "injuriesJson" TEXT;
ALTER TABLE "CharacterState" ADD COLUMN "possessionsJson" TEXT;
