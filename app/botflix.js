//Animação ao carregar a página
window.onload = () => {
    document.body.style.opacity = 1;
};
//Configuração de chaves API
const GROQ_API_KEY = "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".trim()
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
const OMDB_API_KEY = "9b1f9794"
const OMDB_API_URL = "https://www.omdbapi.com"

//Controle de busca
let controladorAtual = null

//Fluxo Principal
async function buscarFilme() {
  console.log("CLICOU 🚀")

    const moodInput = document.getElementById("mood")
    console.log("INPUT:", moodInput)

    const humor = moodInput?.value?.trim()
    console.log("HUMOR:", humor)

    if (!humor) {
        mostrarErro("Preencha o campo com seu humor antes de buscar.")
        return
    }

    if (controladorAtual) {
        controladorAtual.abort()
    }

    const controlador = new AbortController()
    controladorAtual = controlador

    mostrarCarregando()

    try {
        const titulos = await pedirSugestoesAoGroq(humor, controlador.signal)

        console.log("TÍTULOS DA IA:", titulos)

        const filmes = await Promise.all(
            titulos.map(titulo => buscarDetalhesNoOMDB(titulo, controlador.signal))
        )

        const filmesTraduzidos = await Promise.all(
            filmes.map(filme => traduzirFilme(filme, controlador.signal))
        )

        mostrarFilmes(filmesTraduzidos)
    } catch (erro) {
        if (erro.name === "AbortError") return
        console.error(erro)
        mostrarErro("Não foi possível encontrar filmes agora. Tente novamente.")
    }
}

//Etapa 1
async function pedirSugestoesAoGroq(humor, signal) {
    console.log("KEY USADA:", GROQ_API_KEY)
    const body = {
        model: "llama-3.1-8b-instant",
        messages: [
            {
                role: "system",
                content: "Você é um especialista em filmes. Quando receber um humor, responda APENAS com os títulos ORIGINAIS EM INGLÊS de 2 filmes reais e populares. Separe por ponto e vírgula. NÃO use ano, NÃO use tradução, NÃO use explicações. Exemplo: Forrest Gump;The Pursuit of Happyness"
            },
            {
                role: "user",
                content: `Meu humor agora é: "${humor}". Quais 2 filmes você recomenda?`
            }
        ],
        temperature: 0.7,
        max_tokens: 80
    }

    const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify(body),
        signal
    })

    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Erro na API do Groq: ${res.status} — ${err}`)
    }

    const data = await res.json()
    const texto = data.choices?.[0]?.message?.content?.trim()

    if (!texto) throw new Error("Groq não retornou títulos válidos.")

    return texto
    .split(/;|,/)
    .map(t => t.trim())
    .map(t => t.replace(/\(.*?\)/g, "")) // remove (1999)
    .map(t => t.replace(/\.$/, "")) // remove ponto final
    .filter(Boolean)
    .slice(0, 2)

    console.log("USANDO KEY:", GROQ_API_KEY)
    console.log("HEADER:", `Bearer ${GROQ_API_KEY}`)
}

//Etapa 2
async function buscarDetalhesNoOMDB(titulo, signal) {
    const url = `${OMDB_API_URL}/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(titulo)}&plot=short`

    const res = await fetch(url, { signal })

    if (!res.ok) throw new Error(`Erro ao buscar no OMDb: ${res.status}`)

    const data = await res.json()

    if (data.Response === "False") throw new Error(`Filme "${titulo}" não encontrado no OMDb.`)

    return {
        title: data.Title,
        originalTitle: data.Title,
        overview: data.Plot !== "N/A" ? data.Plot : "Sinopse não disponível.",
        poster: data.Poster !== "N/A" ? data.Poster : null,
        rating: data.imdbRating !== "N/A" ? data.imdbRating : "—",
        year: data.Year ?? "N/A",
        genre: data.Genre !== "N/A" ? data.Genre : null,
        runtime: data.Runtime !== "N/A" ? data.Runtime : null
    }
}

//Etapa 3
async function traduzirFilme(filme, signal) {
    const body = {
        model: "llama-3.1-8b-instant",
        messages: [
            {
                role: "system",
                content: "Você é um tradutor. Responda APENAS com um JSON válido contendo as chaves 'title', 'overview' e 'genre', sem explicações, sem markdown, sem blocos de código."
            },
            {
                role: "user",
                content: `Traduza para português brasileiro. Retorne apenas: {"title": "<título em PT-BR ou original se não houver>", "overview": "<sinopse traduzida>", "genre": "<gêneros traduzidos>"}\n\ntitle: ${filme.title}\noverview: ${filme.overview}\ngenre: ${filme.genre}`
            }
        ],
        temperature: 0.3,
        max_tokens: 400
    }

    const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify(body),
        signal
    })

    if (!res.ok) return filme

    const data = await res.json()
    let texto = data.choices?.[0]?.message?.content?.trim()

    if (!texto) return filme

    texto = texto.replace(/```json\s*/i, "").replace(/```/g, "").trim()

    try {
        const traduzido = JSON.parse(texto)
        return {
            ...filme,
            title: traduzido.title || filme.title,
            overview: traduzido.overview || filme.overview,
            genre: traduzido.genre || filme.genre
        }
    } catch {
        return filme
    }
}

function mostrarFilmes(filmes) {
    const resultado = document.getElementById("resultado")

    const cards = filmes.map(data => {
        const poster = data.poster
            ? `<img src="${data.poster}" alt="Poster de ${data.title}" class="w-44 rounded-xl shadow-lg">`
            : `<div class="w-44 h-64 bg-gray-700 rounded-xl flex items-center justify-center text-gray-400 text-sm">Sem poster</div>`

        const genre = data.genre
            ? `<p class="text-red-400 text-xs font-medium">${data.genre}</p>`
            : ""

        const runtime = data.runtime
            ? `<span>${data.runtime}</span>`
            : ""

        return `
            <div class="flex flex-col items-center text-center animate-fade-in gap-3 bg-gray-900 border border-gray-800 rounded-2xl p-5 w-full">
                ${poster}
                <h2 class="text-white text-lg font-bold leading-snug">${data.title}</h2>
                ${genre}
                <p class="text-gray-400 text-xs flex items-center gap-2">
                    <span>${data.year}</span>
                    <span>&bull;</span>
                    <span>&#11088; ${data.rating}</span>
                    ${runtime ? `<span>&bull;</span>${runtime}` : ""}
                </p>
                <p class="text-gray-300 text-sm leading-relaxed">${data.overview}</p>
            </div>
        `
    }).join("")

    resultado.innerHTML = `<div class="flex flex-col gap-5 w-full">${cards}</div>`
}

function mostrarErro(mensagem) {
    const resultado = document.getElementById("resultado")
    resultado.innerHTML = `<p class="text-red-400 text-center">${mensagem}</p>`
}

function mostrarCarregando() {
    const resultado = document.getElementById("resultado")
    resultado.innerHTML = `<p class="text-gray-400 text-center animate-pulse">Buscando os filmes perfeitos para o seu humor...</p>`
}

console.log("KEYS:", { GROQ_API_KEY })