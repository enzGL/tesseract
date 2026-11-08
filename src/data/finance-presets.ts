// Opções prontas do formulário de lançamento (fase 4D). A pessoa escolhe uma ou usa "Outro" e escreve.
// Pessoal e empresa têm categorias diferentes; entrada e saída também.

type Kind = 'in' | 'out'

const CATEGORIES: Record<'personal' | 'org', Record<Kind, string[]>> = {
  personal: {
    in: ['Salário', 'Freela', 'Pró-labore', 'Rendimentos', 'Reembolso', 'Venda de algo', 'Presente'],
    out: ['Moradia', 'Mercado', 'Contas da casa', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Restaurante', 'Assinaturas', 'Cartão de crédito', 'Impostos', 'Investimento'],
  },
  org: {
    in: ['Serviços', 'Vendas', 'Mensalidade de cliente', 'Projeto', 'Reembolso', 'Rendimentos'],
    out: ['Fornecedores', 'Ferramentas e software', 'Impostos', 'Contador', 'Marketing e anúncios', 'Salários e pró-labore', 'Aluguel e estrutura', 'Equipamentos', 'Tarifas bancárias'],
  },
}

export const categoryPresets = (scope: string, kind: Kind) => CATEGORIES[scope === 'personal' ? 'personal' : 'org'][kind]

export const ACCOUNT_PRESETS = ['Nubank', 'Itaú', 'Bradesco', 'Banco do Brasil', 'Caixa', 'Santander', 'Inter', 'C6 Bank', 'Mercado Pago', 'PicPay', 'Dinheiro']

// Descrições comuns de saída, para sugerir como atalho (a entrada sugere os projetos).
const EXPENSES: Record<'personal' | 'org', string[]> = {
  personal: ['Aluguel', 'Condomínio', 'Energia', 'Água', 'Internet', 'Celular', 'Mercado', 'Academia', 'Plano de saúde', 'Fatura do cartão'],
  org: ['Contador', 'DAS Simples', 'Aluguel do escritório', 'Internet', 'Hospedagem e domínio', 'Assinaturas de software', 'Anúncios', 'Fornecedor'],
}
export const expensePresets = (scope: string) => EXPENSES[scope === 'personal' ? 'personal' : 'org']
