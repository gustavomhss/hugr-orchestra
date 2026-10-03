export type SkillEntry = {
  name: string
  description?: string | null
  location: string
  content: string
}

export function filterSkills(skills: SkillEntry[], query: string) {
  const search = query.trim().toLowerCase()
  return skills.filter((skill) =>
    [skill.name, skill.description ?? "", skill.location].some((value) => value.toLowerCase().includes(search)),
  )
}

export function selectSkill(skills: SkillEntry[], location?: string) {
  return skills.find((skill) => skill.location === location) ?? skills[0]
}
