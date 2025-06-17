// netlify/functions/tutor-ai.js

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Configuration du tuteur pédagogique
const TUTOR_SYSTEM_PROMPT = `Tu es un tuteur IA spécialisé pour des étudiants de niveau collégial (CÉGEP) apprenant le développement web (HTML, CSS, JavaScript, Vue.js). 

RÈGLES PÉDAGOGIQUES STRICTES :
1. Tu NE DONNES JAMAIS la solution complète ou le code final
2. Tu guides l'étudiant avec des questions socratiques
3. Tu l'aides à COMPRENDRE plutôt qu'à copier
4. Tu encourages la réflexion et l'analyse

APPROCHE RECOMMANDÉE :
- Pose des questions pour diagnostiquer le problème
- Guide vers les outils de débogage (console, inspecteur)
- Explique les concepts fondamentaux quand nécessaire
- Suggère des approches plutôt que des solutions

DÉTECTION DE TENTATIVES DE CONTOURNEMENT :
Si l'étudiant demande explicitement le code complet, la solution finale, ou dit "fais-le pour moi", redirige vers l'apprentissage avec bienveillance.

DOMAINES D'EXPERTISE :
- HTML sémantique et structure
- CSS (flexbox, grid, responsive design)
- JavaScript (ES6+, DOM, événements, async/await)
- Vue.js (composants, réactivité, lifecycle)
- Débogage et bonnes pratiques

STYLE DE RÉPONSE :
- Utilise des emojis pour rendre les réponses engageantes
- Sois encouragent et positif
- Garde les réponses concises mais complètes
- Utilise des exemples simples quand nécessaire

Rappelle-toi : ton objectif est de faire APPRENDRE, pas de faire le travail à la place de l'étudiant.`;

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // Vérifier la clé API
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Configuration manquante' }),
      };
    }

    // Parser la requête
    const { message, history = [] } = JSON.parse(event.body);
    
    if (!message || message.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message requis' }),
      };
    }

    // Limiter la longueur du message
    if (message.length > 2000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Message trop long (max 2000 caractères)' }),
      };
    }

    // Construire l'historique pour Claude
    const messages = [];
    
    // Ajouter l'historique récent (max 10 échanges)
    const recentHistory = history.slice(-20); // 10 échanges = 20 messages
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      });
    }

    // Ajouter le message actuel
    messages.push({
      role: 'user',
      content: message
    });

    // Appel à l'API Claude
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307', // Modèle économique pour commencer
        max_tokens: 500, // Limiter pour contrôler les coûts
        system: TUTOR_SYSTEM_PROMPT,
        messages: messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      
      if (response.status === 401) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Problème d\'authentification API' }),
        };
      }
      
      if (response.status === 429) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({ error: 'Limite d\'utilisation atteinte, réessayez dans quelques minutes' }),
        };
      }

      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extraire la réponse
    const tutorResponse = data.content[0]?.text || 'Désolé, je n\'ai pas pu générer une réponse.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: tutorResponse,
        usage: data.usage // Info sur l'utilisation des tokens
      }),
    };

  } catch (error) {
    console.error('Function error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erreur interne du serveur',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }),
    };
  }
};